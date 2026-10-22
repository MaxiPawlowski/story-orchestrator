# Implementation Overview — Story Orchestrator v2.9

**Status: PLANNED 2026-10-21 (owner).** v2.9 = player-experience additions and current-feature fixes from the 2026-10-21
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

## Folds into existing plans (not yet applied)

sol's FOLD verdicts name a destination plan. They are recorded here and in `01-triage-sol.md`; none of the destination plans has
been edited yet.

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
