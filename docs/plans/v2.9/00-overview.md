# Implementation Overview — Story Orchestrator v2.9

**Status 2026-10-26: 02-09 BUILT and on master; CLOSING through plan 13; NOT accepted.** Per plan below (each plan's top
status line carries the same facts and points at its record). Owed before the freeze: owner playtest (13 C1, includes 08 O4),
a second consecutive green `suite:nomodel` on one build (13 C8: 188/188 once on 2026-10-26), the image journey rerun that
verifies the head-box fix (13 §GPU rows 2026-10-26), J6 green x2 (J6.8 flaky), freeze (13 C11). Moved to v3.0:
`13-close-out.md` §Move to v3.0, replanned in `docs/plans/v3.0/00-overview.md` §Replan 2026-10-26.

| Plan | State 2026-10-26 | Floors vs result (informational, never retuned) | Left |
|---|---|---|---|
| 02 voice prevention | built, master (wave 1, 2026-10-21) | S6 first set gain 0 at 60/60 ceiling (miss); harder set gain 100 points (met); guidance max 113 (met); repetition 2 -> 1 (first set) | harder-set repetition score; adoption |
| 03 reply polish | S0-S2 built, master 2026-10-22 (shadow); polish off for the playtest | rating floors not run; shadow sane (chat and reasoning untouched 24/24) | S2 at plan size + S3 -> v3.0 |
| 04 reactive cues | built, master (wave 2, 2026-10-22) | C1 40/40, C3/C4 0, C6 all cuts; C2 30/30 met, cue-off arm 30/30 (effect 0 points); C5 0 | off-screen corpus -> v3.0 optional |
| 05 story threads | built, master (wave 1) | P1/P2 100 %/100 % synthetic (met); P4 51/51; P5 p95 2.7-8.5 ms (floor 2 ms: miss); hint 3/10 | P3 real-play -> v3.0 optional; P5 |
| 06 next actions | built, master (wave 2) | LT: F1 40/40, F2 36/40, F3 0, F5 80/80 pass; F4 +0.0 (floor +0.5: miss) | F4 follow-up -> v3.0 |
| 07 echoes | built, master 2026-10-22 | 40/40 schedules, 0 early (jest); narrator ack 18/20 after header fix (pilot, met) | larger count -> v3.0 optional |
| 08 observations | built, master (wave 1) | O1 40/40, O2 12/12, O3 0 (det. + CL with controls) | O4 in the owner playtest (13 C1) |
| 09 feature help | built, master (wave 1) | 24/24 agreement, 0 disclosures; Show me 8/8 cases | none |
| 11 test economy | B1, B2, B4, B5, B6 (vacuous/denominator half) built | stop rules in use for every GPU row since 2026-10-25 | B3 + B6 mutation review -> v3.0 |
| 12 owner playtest | guide written, test story frozen | not run | owner plays (13 C1) |
| 13 close-out | C2, C4, C5, C6, C7, C9, C10 done; C3 model miss; C8 green once | see 13 §Status | C1, C8 x2, C11 freeze |

**Was 2026-10-23 (afternoon, second session): NOT accepted.** 02 S5: `readCharacterCard` built; real-route recheck on sol
arin-sheet 2/2 (luke-sheet void: the card has no first message or example dialogue). 04 C2 cue-off arm: on 30/30, off 30/30, cue
effect 0 points (the corpus shows the event on screen; C2's 100 % does not isolate the cue). Inner-beat wait fixed (starts
before the boundary's reads, reads yield up to 15 s); real-model recheck rides the v2.8 lean night. 06 LT corpus frozen
(`test/measurements/v2.9/06-lt/`, 40 situations, 2 x 40 scenarios, anchors-off seam for the current arm); not run yet.
Records: plans 02, 04 and this overview's side-finding line.

**Was 2026-10-23 (GPU window 2): 02-09 on master with the GPU2 fixes; NOT accepted.** Fixed and re-measured on real
Artemis: 07 narrator echo acknowledged 18/20 (was 0/5; floor 80 % met on the pilot) after the echo got the plan's own header;
05 hint used 3/10 (was 0/3, no floor). Corpus rows run: 05 P1/P2 100 %/100 % (50 sol-labelled synthetic sequences), 04 C2 30/30
and C5 0/40, 02 S6 attribution gain 0 points at a 60/60 ceiling (missed) with repetition 2 -> 1 and guidance max 113 tokens,
06 pilot 12/12 asks answered on one lane. 02 S5 wizard check 0/2 (no tool reads an existing card's text). NOT run: 08 O4,
06 LT, 03 S2 at plan size (each > 2 h or needs a rater not authorized). Record: §GPU run 2026-10-23 below and each plan's
`### GPU run 2026-10-23`.

**Was 2026-10-22 (GPU window): 02-09 on master, 03 S0-S2 merged after a real-model shadow run; NOT accepted.** Real-model
pilots ran for 02-08 (small N, not the predeclared corpora): 04 cue used 5/5, 07 narrator echo acknowledged 0/5 (floor 80 %
missed), 05 narrator hint used 0/3, 06 suggestions 2 of 4 asks answered (grounded 3/4), 08 O3 CL 0/40, 03 shadow sane (chat and
reasoning untouched 24/24, cap honoured, 5 accepted / 6 refused / 4 rate-limited). Every corpus floor still NOT run. Record:
§GPU run 2026-10-22 below and each plan's `### GPU run 2026-10-22`.

**Was: BUILT, no GPU (2026-10-22).** 02, 04, 05, 06, 07, 08, 09 on master (`297e7234`), full gates green (records below and
in each plan). 03 S0–S2 built on `v2.9-03-polish` (`1bd5d6a6`), NOT merged: its merge contract keeps S2 off master alone
(shadow polish on by default calls sol, cap 40/h); owner decides. NOT run anywhere: real-LLM floors, lane scenarios, payload
goldens, campaign adoption. 07 record: plain gates red only on a foreign :6006 holder; `--no-storybook --serial` green +
Storybook alone on :6207 985/985.

**Was: PLANNED 2026-10-21 (owner).** v2.9 = player-experience additions and current-feature fixes from the 2026-10-21
harvest, triaged by gpt-6.1-sol (`01-triage-sol.md`, codex exec, high reasoning, read-only, on `6861d989`). The previous
v2.9 (deferred items) was renamed **v3.0** the same day (`docs/plans/v3.0/00-overview.md`). Nothing here is approved or built;
v2.8 keeps its queue (`docs/plans/v2.8/32-queue.md`), and this set does not reorder it. No model time or pod budget is authorized.

Inputs: `docs/plans/v2.8/extension-research-2026-10-21/` (13 repo reviews, the per-character polish design, a non-ST niche
scout, `SUMMARY.md`) plus sol's own audit of current features (A01–A13 in `01-triage-sol.md`).

## Rules

- v2.8 `00-overview.md` §Rules apply (tiers, new player surfaces need an owner decision, floors informational and never
  retuned, every built feature on by default, thinking and inner voice stay on, English only, no campaign content here).
- Each plan registers its feature, updates `docs/authoring/story-guide.md` (+ `npm run docs:guide`, `npm run docs:settings`),
  keeps new code in lazy chunks (main budget 1,300,000 B) and decides campaign adoption explicitly (review by another model,
  counts only to the owner).
- Model-consuming acceptance = real Artemis replies, thinking and inner voice on, on a lane in an authorized GPU window; corpus,
  prompts, scorer, routes, settings and floors frozen before inference; denominators, abstentions and cancellations reported.

## Owner decisions 2026-10-21

Owner, verbatim: "Work on every plan. Do not use gpu to test yet." Read as approval to build every plan on its recommended
option. Exceptions kept open: anything the plan marks as needing explicit approval beyond that, model time, and campaign work.

- **No GPU:** no Artemis replies, no real-LLM live gates, no S/LT/RP measurements. Those rows are recorded NOT green
  ("not run: no GPU, owner 2026-10-21"). Deterministic tiers, Storybook and no-model lanes are allowed.
- **02:** field `roster[].polish` + Studio "Voice and delivery" group approved; `by_mood` approved; mined repetition lines
  for every story (on-by-default rule); rater route sol default, DeepSeek fallback (route only, no model time).
- **03:** S0 (timing spike, no model call), S1 (pure core) and S2 (polish role + shadow mode) only. **S3 (automatic
  in-place write + chip) is not built**: the P0 thought-carry reduction needs the owner's explicit approval or a preserved-carry
  design. Polish-role default sol, DeepSeek fallback; group = abandon once consumed; dialogue frozen in v1.
- **04:** cue format approved; topics advance on direct address only (no extraction slice F); defaults as recommended.
- **05:** authored-only patterns; four-kind vocabulary and bounds approved; word `patterns`; callback line in What changed approved.
- **06:** check-help field + help line approved; authored greyed offers (slice 3) approved; anchors author-view only; no
  negative-modifier lines in v1.
- **07:** cue-only; wait until `expires` then expire; once per echo per chat.
- **08:** surface, passive checks, perception-only warnings, page-only v1 approved; named voices not built.
- **09:** scope accepted; source labels approved; wording "Turned off by this story".
- **Campaign adoption:** none in this pass (each plan's adoption waits for its measurement).

## Plans

- **01** `01-triage-sol.md` — sol's triage: verdicts V/E/M/G/C/N, audit A01–A13, plan set, challenges to the harvest.
- **02** `02-roster-voice-prevention.md` — characters sound distinct before any rewrite: authored `roster[].polish`, a voice
  line in the drafted member's private block, per-speaker repetition and tics. No play-time model call. Owns the schema 03 uses.
- **03** `03-per-character-reply-polish.md` — the owner's lead idea: a signal-triggered, per-member rewrite of wording only,
  guarded in code and measured against prevention alone. Lands last (timing spike first).
- **04** `04-reactive-character-cues.md` — authored cue bank: characters notice specific events, topics deepen when raised again,
  social norms get noticed; member-private, once/cooldown, rollback ≡ replay.
- **05** `05-evidenced-story-threads.md` — bounded story-sifting patterns over public typed events (Felt/Winnow), with evidence
  refs and authored callbacks.
- **06** `06-grounded-next-actions-and-stakes.md` — "What could I do?" seeded from goals, threads and disclosed check-help hints;
  dormant threads resurface; visible ways to improve a pending check.
- **07** `07-delayed-story-echoes.md` — authored consequences that land later (story time or boundaries) if still valid; cue-only
  first slice.
- **08** `08-player-observations.md` — perception-only "You notice…" details with disclosure gates and optional seeded passive
  checks; never the player's feelings or actions.
- **09** `09-effective-feature-help.md` — Help shows what this chat actually has enabled and what waits for setup (A01, A11).

- **10** `10-review-sol.md` — sol's review of 00 and 02–09 (2026-10-21): every plan fix-first, one P0 (03 thought carry);
  fixes applied the same day (see each plan's §Review 2026-10-21 (sol)).

## Build order (sol)

1. Relevant v2.8 foundation first: stopped-partial contract (A02/M12 → v2.8 69 K13), chapter-fold compatibility (A03/M05 →
   v2.8 69 + 63), transcript-copier warning (M06), measurement hygiene (v2.8 35).
2. v2.9 09 and 02 (measure prevention alone).
3. v2.9 04.
4. v2.9 05 → 06.
5. v2.9 07.
6. v2.9 08 (after the surface and agency decisions).
7. v2.9 03: timing/ownership spike after 02; automatic rewriting only after consumer-order and independent-faithfulness evidence.
   Automatic polish also waits for a design preserving thought carry, or explicit owner approval of its reduction; retaining
   reasoning bytes alone is insufficient (review P0, `10-review-sol.md`).

## Folds into existing plans (applied 2026-10-25)

sol's FOLD verdicts name a destination plan. Applied 2026-10-25 (owner): each destination plan has a `## Folds from v2.9 triage`
section; the V3.0 rows are in `docs/plans/v3.0/05-deferred-items.md`.

- **v2.9 02:** V03 per-speaker repetition/tics, V06 speaker-attribution measurement, A07 separate distinctness score, N08
  per-character verbs and mood delivery, N21 quirk throttle.
- **v2.9 03:** V04 immutable windows/anchors, V08 lexical ignore list, V10 (polish prompt), V13 final accepted text, N21.
- **v2.9 04:** N01 storylet framing in the guide, N03 important vs optional cues, N04 topic tiers, N07 norm reactions.
- **v2.9 06:** N14 greyed visible prerequisites, N25 visible ways to improve a pending check.
- **v2.8 09:** V10 reference-not-instructions in existing prompts, V11 varied example dialogue + monotony warning.
- **v2.8 18:** G02 margin word and whose attempt, G07 player authors feelings/beliefs (agency contract).
- **v2.8 21:** M10 recency scaled to chat length (experimental arm).
- **v2.8 22:** N05 reestablish an interrupted conversation, N15 recovery after setbacks (with 49).
- **v2.8 35 / 24:** V10 existing-prompt fixtures, E01 interval + no-change fixtures, E02 real-play-model fixture prose + holdout, E03, E04, E05, M09, C01 (G9),
  G06, G07 fixtures, A04 witness acceptance, A06 thought-carry fresh corpus.
- **v2.8 42:** A04. **v2.8 43:** M08 causal recall, A05. **v2.8 49:** G04 weighted outcomes (G19), N15.
- **v2.8 50:** M02 story-time span on chapter cards, M03 chronology (with 69 K1).
- **v2.8 51:** G05 slow-burn caps, G06, N06 mood causes, A08. **v2.8 52:** G15 people met (option B), N20/A13 codex supersede.
- **v2.8 54:** A06. **v2.8 58:** E04, G08 holder-scoped reminders. **v2.8 63:** M05, M07, M14, M15.
- **v2.8 69:** M05 fold interior holes (fixture: two seals, retained middle rows, a coverage gap, a no-fold chapter), M06 VectFox
  copier keys, M12/A02 stopped partials (K13), G03 stale-build check, G13 image upload read-back.
- **v2.8 74/36:** A12 instrument the animation stall. **Character-life docs:** A11 off-stage Help copy.

## Deferred to v3.0 (sol verdict V3.0)

V07 LanguageTool guard, M01 player-safe character diary, M04 why-lore-fired provenance, G01 player-declared attempt, G10 time-jump
interrupt at a due event, N09 rumor evidence changes belief, N10 post-story rumor trail, N16 role-cast set-pieces, N19 per-member
phrase bias, N23 named player inner voices, N26 per-member typography, V06 runtime speaker-attribution classifier (needs calibrated
discrimination on a held-out set; measurement stays in 02), G05 automatic relationship decay toward baseline (separate owner
decision and session evidence; authored caps stay in v2.8 51). Not yet copied into `docs/plans/v3.0/05-deferred-items.md`.

## Skipped (sol)

V05, V09 (kept as a possible experiment), V12, M11, M13 (already the rule), G09/G11 (built), G12, G14, G16, C02 (privacy
anti-pattern), C03–C07, N17/N18 (covered), N24. Reasons in `01-triage-sol.md`.

## Decisions for the owner

From `01-triage-sol.md` §Unresolved and each plan's own list:
- 02: approve the authored `roster[].polish` field and mood variants.
- 03: sol as the polish-role default; independent rating route; visible swap after streaming; group cancel vs bounded hold;
  dialogue rewriting in v1.
- 04: cue format; topic progression from extraction or explicit state only.
- 05: authored patterns + a small built-in public library, or authored-only.
- 06/08: new or changed player surfaces (explicit check-help field; observations surface; passive checks).
- 07: cue-only first slice; expire vs wait when temporarily invalid.
- A02: does a user-stopped partial reply count as a turn?
- G07: feelings and conclusions belong to the player (NPC thinking and inner voice unchanged).
- Applying the folds above to their v2.8 plans; copying the V3.0 rows into v3.0 05.
- Campaign adoption per plan after measurement; v2.9 model-time allocation.

## Gate record 2026-10-21 (v2.9 wave 1 merge)

Branch `v2.9-wave1` off master `e7bcee5d`, worktree `C:/dev/so-v29-wave1`. No GPU, no lanes, no model calls.

Merges (`--no-ff`, in order), `npm run gates:quick` green after each:
- 09 `v2.9-09-feature-help` @`27b1d8f2`: clean.
- 02 `v2.9-02-voice` @`62dc3495`: conflict `src/guide/pages.generated.ts` only (regenerated with `npm run docs:guide`, `npm run docs:settings`).
  Follow-up: `FEATURE_STATE` row `character-delivery` -> `master("delivery")`, `delivery.repetition` in `UNMAPPED_CONTROLS`,
  `isOn` dropped from the registry row (09 rule).
- 08 `v2.9-08-observations` @`90bd722d`: conflicts `pages.generated.ts` (regenerated), `snapshotBuilder.ts` (observation roll chips
  kept beside 02's `byMember` repetition rows). Follow-up: codeHealth S3 file budget: `roster-polish` topic and the delivery and
  observation diagnostic maps moved to `copilot/guideTopicsDelivery.ts` / `guideTopicsCodex.ts`; two schema fields joined onto
  existing lines. `observations` has no story feature policy, so no `FEATURE_STATE` row.
- 05 `v2.9-05-patterns` @`f1c3cc1d`: 16 files, all both-sides unions (game layer `observations` + `patterns`, `gameFields`,
  `usesGameLayer`, agent ops/tools, readTools, diagnostics codes/consequences/checks, guide coverage, memoryInjector staging
  condition keeps 05's `story.patterns?.length` and 02's staging sources, `StoryUpdateDeps` keeps both `reconcileExtras` (08)
  and `reconcile` (05), wiring returns `patterns` and `delivery`). Both 02 and 05 exported the label-diagnostics name helper
  under different names: kept `unknownEntityNames`, `patternDiagnostics.ts` switched to it. `diagnostics.test.ts` every-code
  case split into two stories (each code fires once). `FEATURE_STATE` row `story-patterns` -> `master("patterns")`, `isOn` dropped.
  codeHealth S4: `wireCoordinators` over 150 lines, `storyUpdateDepsFor` extracted.

Main bundle (budget 1,300,000 B, not raised): master 1,291,214; combined 1,307,579 (over). Moved into the game-layer chunk
(`GAME_LAYER.delivery|living|stretch`; the layer is awaited at startup, so runtime behaviour is unchanged; `usesGameLayer`
now also names `roster[].polish`, `living`, `checkpoints[].stretch`, so without the layer such a story is refused as loading,
like other game-layer fields):
- `engine/validate/delivery.ts` (02): 1,304,314.
- `engine/validate/living.ts` (pre-existing; `readLivingParts` helper keeps `parseStory` under the S4 branch budget): 1,300,531.
- `engine/validate/stretch.ts` read and checks (pre-existing; the `player_turns` key check stays in `validate.ts`): 1,297,511.
- Final `npm run build`: `dist/index.js` 1,297,590 B.

Full gates on `c65d40cc` (no `--resume`, Storybook included, :6006 free): `npm run gates -- --jobs=3` ->
`gates: all green in 424.5s` (test:replay 32 of 32 killed, test 857 suites / 9957 passed + 1 skipped, build, test:debug,
typecheck, typecheck:test, debug:typecheck, lint, test:release, test:plugin, test-storybook:ci 160 suites / 966 passed).

NOT run: live lane checks, payload goldens, every real-LLM row of 02/05/08 (no GPU, owner 2026-10-21). Not staged into ST,
`plugins:install` not run (end of all waves).

## Gate record 2026-10-22 (v2.9 wave 2 merge: 04, 06)

Branch `v2.9-wave2` off master `65aebaa0`, worktree `../so-v29-wave2`. `v2.9-03-polish` NOT merged (its contract forbids S2
alone; waits for the owner).

Merges (`--no-ff`, in order):
- 04 `v2.9-04-cues` @`8584be0b`: clean.
- 06 `v2.9-06-next-actions` @`f1dc8490`: conflicts all both-sides unions: `diagnosticCodes.ts` (cue codes + `offer-names-unknown`,
  `check-hint-names-unknown`), `diagnostics.ts` (cue + offer consequences and checks), `diagnostics.test.ts` every-code case
  (cue story and offer/hint story kept as two `runDiagnostics` calls), `guideTabs.ts` game tab (`offers` after `checks`, `norms`
  kept), `validate/gameLayer.ts` `usesGameLayer` (`norms` + `checkpoints[].offers`), `gameLayerImpl.ts` (`cues` + `offers`),
  `copilot/agent/gameOps.ts` (`setCheckpointOffers` beside `...CUE_AGENT_KINDS`; 06's `readBeatCall` kept, called from 04's
  `readCoreGameCall`, `readGameCall` stays 04's cue dispatcher). Regenerated: `npm run docs:guide`, `npm run docs:settings`,
  `SO_RECORD_ARRIVAL_GOLDEN=1` for `test/goldens/arrival-findings.json` (04, 05, 06 scenario rows).
- `npm run gates:quick` after the merges: green (replay 32 of 32).

Main bundle (budget 1,300,000 B, not raised): master 1,297,590; combined 1,300,085 (over by 85). Fix: `package.json`
`"sideEffects": ["*.css"]`, so webpack skips pure re-export barrels (`engine`, `memory`, `extraction`, `pacing`, `stagecraft`,
`talk` `index.ts`) in the main chunk; also leaving main for lazy chunks only: `engine/offerSchema.ts`, `extraction/backlogPlan.ts`,
`stHost/presets.ts`, `stagecraft/writeAhead.ts`. Webpack stats diff: no module dropped from the build; every moved module and
barrel has no top-level statement besides declarations (CSS side-effect imports kept by the list). Final `dist/index.js`
1,290,479 B: 9,521 B headroom for plan 07.

Full gates on `5b5c7055` (no `--resume`, Storybook included, :6006 free): run 1 RED only at `test:debug` childTree "wrapper shell is
killed" (known load flake); `npm run test:debug` alone: 1484 pass, 0 fail. Run 2 `npm run gates` -> `gates: all green in 327.4s`
(build, typecheck, test:debug 1484/1484, test:replay, typecheck:test, debug:typecheck, test:plugin, test 862 suites / 10107 passed
+ 1 skipped, test:release, lint, test-storybook:ci 162 suites / 979 passed).

NOT run: lane live scenarios `v29-04-cues.json`, `v29-06-anchored-suggestions.json`, payload goldens, every real-LLM row and floor of
04/06 (no GPU, owner 2026-10-21). Not staged into ST, `plugins:install` not run (end of all waves).

## Lane record 2026-10-22 (no-model)

- Lane 41 (`st-lanes.mts seed 41 --fresh`, `no-model 41`, `image.enabled`/`sprites.enabled` off in the lane copy), restarted after
  the staging of master `b220a868`; served bundle `cb12b35851ae` (`so-run-header` `run-header-v29-lane-pre.json`, matches
  `dist/manifest.json` `bundleSha256`). Group `Group: Arin, DM Narrator` (`1759606632088`) from each fixture's `requires`. Evidence
  `C:\dev\so-lanes\41\debug\v29runs\`, `payload-v29\`. Lane stopped at the end.
- Scenarios present: 04, 05, 06, 07, 08 (no `v29-02-*` or `v29-09-*` scenario on master; `v29-03-polish-standin.json` is on
  `v2.9-03-polish` only, skipped). None needs `lane: model`, so the GPU-run list from lane scenarios is empty.
- `v29-04-cues.json`: pass x2 (15/15).
- `v29-05-patterns.json`: pass x2.
- `v29-06-anchored-suggestions.json`: pass x2.
- `v29-07-echoes.json` on master: fail x2, step 7 "timed out after 10000 ms: the echo scheduled". Fixture bug: `/cp set` commits
  its own boundary (as 04 and 08 rely on), so the transition fired and the echo was scheduled there (due next boundary), and the
  following `/sendas` already landed it. Fix on this branch: the "walks out" `/sendas` moves before `/cp set`. With the fix:
  pass x2 (17/17). `npm run gates:quick` green.
- `v29-08-observations.json`: pass x2.
- Memory-model breaker left open by every fixture (no backend on the lane) and closed by cleanup: expected on a no-model lane.
- Real-LLM leak: the no-model lane still made 28 opencode `openai/gpt-6.1-sol` harness calls (subscription, `costUsd` 0), all
  during scenario runs, none during payload captures. Cause: `st-lanes no-model` strips only text-model keys; the lane copy keeps
  the owner's `routes.authoring` harness route (and an unset authoring role defaults to sol whenever the harness plugin offers
  it), and 04/05/07/08 leave `briefingDraft` on, so the briefing draft on import ran on sol. No GPU use: the local controller
  reported text unloaded throughout; ComfyUI untouched. Open: `no-model` should also take harness routes off the lane, or the
  fixtures should declare `briefingDraft: "off"` / `innerBeat: "off"`. Not fixed here (lane tooling decision).
- Payload goldens (`so-payload-golden.mts capture`, 8 cases, no model call): r1 and r3 failed in cleanup, "no
  /api/settings/save answer within 15000 ms" (environment; the lane's `settings.json` is 11 MB); r2 and r4 complete.
  `diff r2 r4`: identical. `diff` against the latest full baseline `C:\dev\so-live-lanes\81\payload-q55\q55` (`4c82f465`):
  0 undeclared hunks; group-opening, group-memory, group-lore-placement same; group-away-notice, group-narrator-holdings,
  group-relationships fixtures changed since that baseline, and group-commitments (vs `payload-q55b/r2`, fixture changed) and
  group-delivery are not comparable. r2/r4 (`C:\dev\so-lanes\41\debug\payload-v29\`) are the new baseline for all 8.

## GPU run 2026-10-22

- Branch `v2.9-gpu-run` (worktree `C:/dev/so-v29-gpu`) off master `a082a064`: merges `v2.9-03-polish` (`6524a1ba`, master merged in
  first, full gates green there), adds the real-model scenarios `v29-03-polish-shadow-forced.json`, `v29-04-07-model-pilot.json`,
  `v29-05-model-pilot.json`, `v29-06-model-pilot.json` (`requires.lane: model`), arrival golden rows, the records.
- Runs: lane 41 master (`cb12b358`): 04/07 pilot x5 pass, 06 pilot x2 (2 of 4 asks answered; one aborted run), 05 pilot x3 pass;
  lane 42 03 branch (`33506e23`): shadow x2 (free, forced) pass. Numbers per plan.
- Not run (each > 1 h or needs a rater that does not exist yet): 02 S6, 03 rating floors, 04 C2/C5 corpus, 05 P1/P2, 06 LT,
  07 at its denominator, 08 O4, payload goldens with a model. No fix branch was needed for the product; the one harness note
  (06 fixture `ext_setting` wipes install settings for its run) is in 06's record.
- `npm run gates -- --serial` on `f28f647f` (no `--resume`, Storybook included): `gates: all green in 612.3s` (test 881 suites /
  10307 passed + 1 skipped, test-storybook:ci 165 / 993, replay 32 of 32 killed). Docs-only commit after it.
- GPU left as found: controller manual hold, text unloaded; lanes 41/42 stopped (end-of-window evidence in this section's commit).

## GPU run 2026-10-23

- Branch `v2.9-gpu2-fixes` (worktree `C:/dev/so-v29-gpu2`) off master `1b2beb9e` (peer's v2.8 queue merge on `45e4a83b`):
  `137a359b` fixes (07 echo header, 05 hint header, `ext_setting` key path + 06 fixture, `polishStandIn` test made deterministic),
  `a4c2dc6b` corpora and harness (05 P1/P2 corpus + jest measure, 02 S6 arms, 04 C2 corpus, pilots keep full replies,
  `so-wizard-agent recipes --fixture`), then these records.
- Runs, one model lane at a time (lane 42 on the fixed build, bundle `c28c0dcf`, ST code copy `C:/dev/st-v29-08`; lane 41 on the
  master bundle for the diagnosis; lane 44 no-model for the wizard check): 07 pilot x28 (20 rated), 05 pilot x10, 06 pilot x3,
  02 S6 2 x 60 replies, 04 C2 40 replies, plus prompt A/B runs straight to the controller. Numbers per plan.
- Side finding, **fixed 2026-10-23** (`v2.9-dev-2026-10-23`: boundary work `inner-beat` now runs at order 9, before
  `scheduler-tick`, and the scheduler waits up to 15 s for an in-flight beat before a read, `extraction/yieldGate.ts`, test
  `schedulerYield.review.test.ts`; real-model recheck owed): on one GPU the inner beat for a narrator draft regularly loses the 3 s `INNER_DRAFT_WAIT_MS` because it
  queues behind the extraction read of the same boundary (07 and 05 diagnosis prompts carried no beat). The late beat lands for a
  swipe only.
- Not run: 08 O4 (needs 10 written tasks and a player in the UI), 06 LT (40 stories to author first), 03 S2 at plan size (> 2.5 h
  at the 40/h cap; independent rater not authorized).
- `npm run gates -- --serial` on `41e907e3` (no `--resume`, Storybook included): `gates: all green in 439.9s` (test 885 suites /
  10325 passed + 1 skipped, test-storybook:ci 165 / 995, replay 32 of 32 killed, test:debug 1491). A first run on `e270c89a` was red
  at test:debug only (the 05 pilot store step read the 07 pilot global; fixed in `41e907e3`). Docs-only commit after it.
- GPU left as found: controller manual hold, text unloaded, no llama-server process, 1449 MiB used (desktop); lanes 41/42/44 stopped.

## Owner decisions 2026-10-25

1. Suggestion name filter: stays strict (a suggestion naming an unreached checkpoint is dropped).
2. v2.9 06: help line on the player surface; greyed offers Author view only.
3. A02: a user-stopped partial reply is not a turn until the player sends again (v2.8 69 K13).
4. G07: the player owns their character's feelings and conclusions; NPC thinking and inner voice unchanged (v2.8 18 agency).
5. Folds applied to their plans (above); V3.0 rows copied to v3.0 05.
6. v2.8 53: a group-disabled member does not hear a `present` move.
7. v2.8 55-59 move to v3.0.
8. v2.9 03: S2 rater Sol (self-rating caveat recorded); S3 to v3.0.
9. R8 thinking A/B dropped.
10. Pod/context rows: those that fit 32K run on the 3090, informational; R5 (>= 48K) to v3.0.
11. v2.9 08 O4: Sol writes the 10 tasks; the owner's playthrough is the player.
12. v2.9 02 S6: Sol writes a harder card set.
13. Human evaluation: the owner's own playthrough is the one human evaluation for v2.7-v2.9.
- Test economy and stop rules: `11-test-economy.md`.

## Close-out split 2026-10-25 (owner)

- Close v2.8 and v2.9 with nothing open but the v3.0 list: `13-close-out.md` (do now C1-C11; move to v3.0 list).
- Owner playtest guide: `12-owner-playtest.md` (C1).
