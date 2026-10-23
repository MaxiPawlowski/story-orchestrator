# Plan 09 — Effective feature state in Help

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); not built; owner decisions pending.** Implementation
tier **D**; acceptance **D** (jest state matrix, Storybook, browser check on a lane at desktop and phone sizes). No model
call, so no real-LLM row. Overview rules: `docs/plans/v2.8/00-overview.md` §Rules.

## What it is

- Help (`#so-help-open-panel` floating panel) says, per feature, what **this chat** has: on, off and by whom (install, story,
  chat), or waiting for setup. Today it says what the **install defaults** are.
- One state vocabulary: Help reuses the snapshot's resolved features (`snapshot.features`) and the Features page's status
  words. No second resolver, no second readiness registry.
- Off-stage-event copy corrected: events apply automatically by default; Review makes them wait.
- Evidence status (registry `status`, measured floors) stays separate from enabled state.

## History and evidence

- Triage `docs/plans/v2.9/01-triage-sol.md`: audit A01 (PLAN v2.9 09, P5, M, risks D/K: "reuse the existing resolved
  state and check registry; do not create another resolver"), A11 (FOLD v2.8 character-life documentation; parity in v2.9
  09, P4, S: "correct the explanation; do not change the approved default"), plan set §"09", build order step 2.
- Research: none. The extension research (`docs/plans/v2.8/extension-research-2026-10-21/SUMMARY.md`) names no Help or
  feature-state item; this plan comes from sol's code audit only. No disagreement to resolve.
- Approved default kept: `meanwhileAcceptMode` default `auto` (owner rule "every built feature on by default", v2.8
  00-overview rule 9; queue `docs/plans/v2.8/32-queue.md:35` N4 lists "meanwhile auto").

## Current state in code

Verified on `6861d989` (re-verified 2026-10-21 for the sol review). A01 and A11 hold; A01 is wider than sol wrote (findings
below).

- **Help reads install settings.** `HelpHost` takes `getGlobalSettings()` (`src/components/help/HelpHost.tsx:31`) and passes
  `feature.isOn(settings)` (`:49`) to `HelpPanel`, which renders a bare On/Off chip (`src/components/help/HelpPanel.tsx:51`,
  words `src/features/helpCopy.ts:8-9`). `HelpHost` gets no snapshot; its mount already has one
  (`src/presenceUi.tsx:155`, `:161`).
- **The resolved state exists.** `snapshotBuilder` publishes `features: resolveFeatures(getGlobalSettings(), story,
  extras.overrides)` and `featureOverrides` (`src/runtime/snapshotBuilder.ts:440`); with no loaded story it resolves
  against `null` (install view). `ResolvedFeature` carries `enabled, source, declined, masterOff, reenabled, automatic,
  controls` (`src/runtime/featureResolve.ts:14-22`).
- **Two status vocabularies already.** Index cards use `featureStateWord` ("Turned off by story",
  `src/runtime/featureResolve.ts:26-31`); the detail page uses a private `featureStatus` ("Turned off by this story",
  "Missing setup: choose a model", "Fallback: model route unavailable", "Waiting for review: N changes", route state from
  `snapshot.roleRoutes`; `src/components/workspace/FeaturePages.tsx:24-37`). Help would be a third.
- **Registry `isOn` disagrees with the resolver's master switch even at install level** (finding beyond A01):
  - `meanwhile-proposals` reads `stagecraft.meanwhileAcceptMode !== "off"` (`src/features/lifeFeatures.ts:54`); the master is
    `featureSwitches.meanwhile` (`src/runtime/featureControls.ts:95`).
  - `inner-voice` reads `innerBeat || harvestReasoning` (`src/features/registry.ts:253`); master `memory.innerBeat`
    (`featureControls.ts:74`).
  - `chapters` reads `recap !== false || seal !== false` (`registry.ts:208`); master `memory.chapters.seal`
    (`featureControls.ts:38`).
- **Registry → story feature map exists for routing only.** `POLICY_TARGETS` (`src/features/registry.ts:458-465`) maps 18
  registry ids to `[StoryFeatureId, control]` and rewrites their `where` to `featureAt` (`:472-477`). Story features with no
  registry row in it: `reading`, `memory`, `agency`, `promises`, `prefetch`, `illustrations`, `poses`, `cardState`.
  Several rows map a registry id to a **subcontrol**, not the master: `curator-create → curator.create`,
  `curator-markers → curator.acceptMode`, `meanwhile-proposals → meanwhile.acceptMode`, `chapters → chapters.recap`
  (`registry.ts:460-462`). The resolver keeps each control's own value and source in `controls[field]`
  (`src/runtime/featureResolve.ts:68-75`); `enabled` reflects the master only (`:76-79`), so `create: false` with the
  curator on is a real state.
- **Promise ownership.** `promises-remembered` is the extracted player-promise feature (`settings: ["memory.promises"]`,
  `src/features/promiseFeatures.ts:7-13`); `npc-commitments` is authored NPC commitments (`settings: []`, `needs: ["story"]`,
  `src/features/lifeFeatures.ts:39-45`), present when the story declares `roster[].commitments`
  (`src/engine/validate/gameLayer.ts:21`, `src/engine/life/commitments.ts:43`).
- **Story memory is two story features.** Registry `memory` owns both `extraction.*` and `memory.enabled`/injection
  settings (`registry.ts:182-190`); the resolver splits them into `reading` (`extraction.enabled`) and `memory`
  (`memory.enabled`) (`src/runtime/featureControls.ts:22-32`).
- **Checks per feature.** `Check.feature` names a registry id (`src/runtime/checks.ts:60-61`) on many rows across
  `checks.ts`, `checksExtensions.ts`, `checksGame.ts`, `checksPersona.ts`, `checksSetup.ts` (models-per-task, images,
  chapters, lore, judge, …: `:173`, `:192`, `:244`–`:421`) and `checksSprites.ts:10`, `:24`. `CheckResult` carries only the
  check id (`checks.ts:66-70`, built `:169`), not `feature`; join on `CHECKS` (`checks.ts:154`). `forViewer` is private
  (`src/runtime/repair.ts:100`); the exported viewer-safe surface is `setupFindings(snapshot)` (`repair.ts:120-131`:
  blocks/degrades/info/dismissed, already through `forViewer`). Route readiness also lives in `snapshot.roleRoutes`
  (`FeaturePages.tsx:28-35`).
- **A11 confirmed.** Registry copy: "Nothing lands until you accept it in Author view" (`src/features/lifeFeatures.ts:48-50`).
  Default `auto` (`src/runtime/agendaProposals.ts:11`, `src/runtime/settingsModel.ts:212`); scheduled pass accepts every
  waiting proposal when mode is `auto` (`src/runtime/meanwhilePort.ts:54-56`). The settings reference already says
  "Automatically" (`docs/guide/setup/settings-reference.md:111`); the author guide has no off-stage-event prose beyond the
  controls list (`docs/authoring/story-guide.md:36`).
- Show me: Help routes through `onShowMe(feature.where)` (`HelpPanel.tsx:60-61`); `featureAt` targets land on
  `#so-feature-<id>-<control>` in Story → Features (`src/features/where.ts:18-21`), guarded by
  `src/features/showMeTargets.test.ts:113-197`. In a no-story chat the Features page renders the controls disabled
  (`FeaturePages.tsx:103`).
- Storybook exists for both surfaces: `src/components/help/HelpPanel.stories.tsx` (stub `isOn`, `:14`),
  `src/components/workspace/FeaturePages.stories.tsx`.

## Options

| Design | Cost | Risk |
|---|---|---|
| A. Help reads `snapshot.features` + shared status function extracted from `FeaturePages` (`runtime/featureStatus.ts`), registry gains a state map | S–M | low; one vocabulary, Help and Features cannot drift |
| B. Fix each registry `isOn` to take `(settings, resolved)` | M | two state paths remain; every `isOn` closure kept in step by hand |
| C. New "feature health" dashboard with its own readiness rows | L | sol's Out list; second registry |

## Recommendation

Option A, three slices, each gated alone.

- **S1 — one status function.** Move `featureStatus` out of `FeaturePages.tsx` into pure `src/runtime/featureStatus.ts`
  (inputs: `ResolvedFeature`, the snapshot slice it reads, `install` flag, waiting count). Fold `featureStateWord` into it as
  the short form so index card, detail page and Help share one word table ("Turned off by story" vs "…by this story" picks
  one). Returns `{ word, source, setup: "ready"|"missing"|"fallback"|"waiting"|"no-story" }`. FeaturePages calls it; output
  unchanged except the unified wording. Jest table over the same inputs.
- **S2 — Help shows effective state.**
  - Registry: `FEATURE_STATE` map, registry id → a **state predicate** over the resolved features
    (`snapshot.features`), with provenance. Predicates read existing resolved controls only, never settings again. Row kinds:
    - master: `{ feature, control: "enabled" }` (pacing, speakers, …);
    - subcontrol: `{ feature, control }` keeps the control's own value and source, gated by the master: `curator-create` reads
      `curator.enabled && curator.create` (source = whichever is off), `curator-markers`/`meanwhile-proposals` read the
      accept mode (`off`/`review`/`auto` words), `chapters` reads `chapters.enabled` plus its recap control;
    - composite: `memory` (Story memory) shows `reading` and `memory` (injection) as two separate states, never `reading`
      alone;
    - state-only rows: `promises-remembered → promises`, `pose-library → poses`;
    - authored presence: `npc-commitments` is on when the loaded story declares commitments (from the snapshot's story/game
      projection, no settings read); no story = "Needs a story". Never mapped to `promises`.
    Routing stays on `POLICY_TARGETS`. Test: every `StoryFeatureId` and every `FEATURE_CONTROLS` control either has a row or
    a stated reason.
  - `HelpHost` takes `snapshot` from `PanelsHost` (`presenceUi.tsx:161`). Mapped features: chip = `featureStatus` short word
    + source chip (Install / Story / This chat), plus one setup line when `setup !== "ready"`. Unmapped install-only
    features (HUD, inline level, judge uses): keep `isOn(settings)`, chip labelled "Install".
  - Registry `isOn` for mapped features is removed (state comes from the resolver); the three divergent closures go with
    it. Unmapped `isOn` stay.
  - No-story context: chip reads "Default for new stories" from the install resolution; never "Off in this chat". Show me
    for a mapped feature routes to Orchestrator → Defaults (`#so-feature-<id>-<field>` on the Defaults page), never to
    Story → Features, whose controls are disabled without a story (`FeaturePages.tsx:103`).
  - Check consequences: consume `setupFindings(snapshot)` (already viewer-filtered), join each step's `check` id to `CHECKS`
    for its `feature`, and show the step under the row whose id matches, with its Show me. Every check with a `feature`
    counts (no seven-check list). Export a shared viewer helper from `repair.ts` only if `setupFindings` does not suffice; no
    readiness registry, no new checks.
  - Evidence status (`Feature.status`) stays a separate optional "Experimental" tag, never merged into the state chip.
  - `HelpPanel` props change from `isOn` to `stateOf(feature) → { word, source, setup?, finding? } | null`; story updated with
    the 24-combination fixtures. HelpHost already lazy (`presenceUi.tsx:28`); `featureStatus.ts` is small, main budget
    unaffected (measure).
- **S3 — A11 copy parity.**
  - `meanwhile-proposals` `oneLine`/`what`: automatic by default; Review makes each wait for Author view; Off stops them.
  - Parity test over accept-mode features (meanwhile, curator, continuity, agency): registry `what` names the default
    mode's behaviour from `defaultGlobalSettings()` (`settingsModel.ts:211-212`), so a default change fails the copy.
  - Author guide: add the off-stage-event paragraph to the character-life topic (`docs/authoring/story-guide.md`, compact
    twin `src/copilot/guideTopics.ts`), `npm run docs:guide`, `npm run docs:settings`. This is the v2.8 character-life doc
    fold; if v2.8 lands it first, S3 only adds the parity test.

No schema, validation, Studio, mutation or wizard tool change: nothing authored. No new setting. Registry entry for Help
itself (`registry.ts:403-408`) gets its `oneLine` updated ("…whether it is on in this chat…").

## Predeclared floors

Sol's, informational, never retuned:

- 24 state combinations covering defaults, story declines, chat overrides, unavailable routes and no-story context:
  Help / workspace (index + detail) / control agreement **100%** (24 of 24).
- **Zero** author-only disclosures in player-mode Help across those 24 (no review contents, no author-audience rows, no
  check rows with `player: null`).
- Browser verification at desktop and phone sizes; **all** Show me links from Help reach the relevant control (denominator =
  every Help row with Show me in each view, player and Author, at each size; record the count).

Proposed 24, an explicit list (no Cartesian construction), frozen before the build as a jest fixture table
(`src/runtime/featureStatus.cases.ts`); each case names feature, context and seeded state:

1. pacing, loaded story, install default (on).
2. pacing, no story, install default (Defaults route).
3. pacing, loaded story, install master off.
4. pacing, no story, install master off.
5. pacing, loaded story, story `"off"`.
6. pacing, loaded story, story off + chat re-enable (warning shown).
7. pacing, loaded story, chat `"off"`.
8. meanwhile, loaded story, default `auto`.
9. meanwhile, loaded story, chat override accept mode `review`.
10. meanwhile, loaded story, story sets accept mode `off`.
11. meanwhile, no story, install master off.
12. curator-create, loaded story, curator on + `create` false (subordinate off).
13. curator-create, loaded story, curator master off.
14. curator-create, no story, install default.
15. inner, loaded story, route ready.
16. inner, loaded story, route missing (setup line).
17. inner, loaded story, route not answering (outage, `model-role-outage` finding).
18. inner, no story, install default.
19. Story memory, loaded story, reading on + injection off (two states).
20. Story memory, loaded story, reading route outage.
21. sprites, loaded story, automatic.
22. sprites, loaded story, explicit off at install.
23. npc-commitments, loaded story declaring commitments.
24. npc-commitments, no story ("Needs a story").

Floors unchanged: 24 of 24 agreement, zero author-only disclosures, all Show me links.

## Gates by tier

- S1, S2 (UI, ST-facing): `npm run gates:quick` until green, then `npm run gates` (Storybook included) + `npm run build` +
  `npm run stage`; live gate on a lane (30+, never lane 0), no model needed (`st-lanes.mts no-model <n>`):
  `st-navigation.mts recent-group` → `so-state.mts current` → open Help in player and Author view, read each row's chip
  against `snapshot.features` and the Features page, click every Show me, assert the target is topmost (`hit-test`), in a
  loaded-story chat and in a no-story chat (Show me lands on Orchestrator → Defaults), at
  `ST_DEBUG_VIEWPORT=1920x1080` and `ST_DEBUG_VIEWPORT=390x844`. Seed story/chat states with
  `manager.setFeatureOverride` and a fixture story declining features; restore overrides and delete the sandbox chat.
- S3: copy + test = pure-module tier (`npm run typecheck && npm run lint && npm test`, `typecheck:test`), docs regen.
- Plan close: `npm run gates` without `--resume`; gate record appended here.

## Privacy and spoiler notes

- Player Help shows state words and counts only, exactly what the player Features page shows today (`FeaturePages.tsx:142`
  shows a waiting count, never contents). Check findings come from `setupFindings` (through `forViewer`), so author-only
  rows never render. `npc-commitments` presence shows on/off only, never commitment text.
- Author-audience registry rows stay hidden in player mode (`visibleFeatures`, `registry.ts:483`).
- "Turned off by story" names no story content. No held-secret path is touched; no shared tier, memory or prompt changes.
- No campaign content in fixtures: synthetic story only.

## Invariants touched

- **One snapshot, one subscription**: Help reads `snapshot.features` passed from `PanelsHost`; no manager getter in render.
- **One check registry; Repair is its ordering**: Help reuses `setupFindings` results joined to `CHECKS` by `feature`; no
  toast, no new surface, no new check.
- **Player mode is the publishable surface; author view adds, never conditionally reveals**: player rows are a strict
  subset of author rows.
- **Main bundle budget**: Help stays in its lazy chunk; status function is small. Build reports the size.
- **components ↔ studio boundary** (`architecture.test.ts`): `featureStatus.ts` lives in `runtime/`, imported by both
  components; nothing from `studio/`.
- **Install-wide settings as delta over defaults**: nothing written; reads go through the resolver.

## Dependencies and links

- Existing v2.8 feature-policy and workspace work (`featureResolve.ts`, `FeaturePages.tsx`). No model dependency.
- v2.8 character-life documentation (A11 fold) for the guide paragraph.
- Build order step 2 alongside v2.9 02 (no shared code).
- **Cross-plan rule (sol review 2026-10-21):** every later v2.9 feature plan (03–08) extends 09's `FEATURE_STATE` mapping and
  the parity fixture table when it lands: new controls register in `FEATURE_POLICY_FIELDS`/`FEATURE_CONTROLS`, chat
  overrides live in `extras.overrides` (never `extras.ui`, which stays display-only), precedence install master → authored
  default → chat. A feature plan closes only with its rows added to the state map and at least one parity case; the 09 test
  "every `StoryFeatureId`/control has a row or a reason" fails otherwise.

## Decisions for the owner

- Accept scope (sol: none beyond that). Implicit in it, flagged so the owner sees them:
  - Help chips gain a source label (Install / Story / This chat): a small player-visible change on an existing surface
    (v2.8 rule 4); the vocabulary is the Features page's own.
  - One wording for story-declined ("Turned off by story" or "…by this story").

## Unresolved questions

- Does Ask's feature knowledge (`src/copilot/knowledge/`) report on/off from install settings too? Not verified here; if it
  does, route it through `featureStatus` in S2 or leave it for a later plan.
- State-only map rows for `agency`, `prefetch`, `illustrations`, `cardState`: which registry row, if any, owns each?
- Should a chat re-enable of a story-declined feature show its warning ("authored limits still apply") in Help too, or only
  on the Features page?

## Review 2026-10-21 (sol)

Findings from `10-review-sol.md` §09 and cross-plan items naming 09; code re-verified on `6861d989`.

- P1 state map owner/subcontrols: applied. `promises-remembered → promises`; `npc-commitments` = authored presence
  (`lifeFeatures.ts:39-45`, `gameLayer.ts:21`); subcontrol rows keep control value + source (`featureResolve.ts:68-79`) for
  curator create, accept modes, chapters recap; Story memory shows `reading` and `memory` separately; predicates read
  resolved controls only (S2).
- P1 check association/viewer: applied. Help consumes `setupFindings` (`repair.ts:120`), joins `check` id to `CHECKS`
  (`checks.ts:154`) since `CheckResult` has no `feature` (`checks.ts:66`); seven-check claim removed (sprites, images, routes
  and others carry `feature`). No readiness registry.
- P2 no-story routing and 24 cases: applied. No-story Show me routes to Orchestrator → Defaults; explicit 24-case list with
  loaded-story and no-story cases, master off, story/chat overrides, subordinate off, route outage; Cartesian construction
  removed. Floors unchanged.
- Cross-plan P1 settings through resolver: applied as the rule in Dependencies — later plans extend `FEATURE_STATE` and the
  parity fixtures, controls in `FEATURE_POLICY_FIELDS`/`FEATURE_CONTROLS`, overrides in `extras.overrides`, `extras.ui`
  display-only.
- Cross-plan held-secret filter, 04/07 offer API, 05/06 projection, new-only chunk activation, extras reconciliation, model
  routing: not applicable to 09 (no authored text, no extras slice, no model call); 09 shows on/off only.
- Thinking and inner voice: untouched; Help only reports their state.

## Gate record 2026-10-21 (v2.9 build, branch v2.9-09-feature-help)

Built on `e7bcee5d`; commits `37a586b8` (S1), `2363f844` (S2+S3), `00fd4959` (live-check fixes).

Built:
- S1: `src/runtime/featureStatus.ts` (one word table, `featureStateWord` short form, `featureStatus` -> `{word, short, source, setup}`,
  `waitingCount`); `FeaturePages` uses it; index wording unified to "Turned off by this story" (owner wording), player guide updated.
- S2: `src/features/featureState.ts` (`FEATURE_STATE`: master / control / mode / parts / authored rows, `UNMAPPED_STORY_FEATURES`,
  `UNMAPPED_CONTROLS` with reasons); `src/runtime/helpFeatureState.ts` (`helpFeatureState`, `findingsByFeature` over `setupFindings`
  joined to `CHECKS` by `feature`); `HelpPanel` takes `stateOf`/`whereOf`/`findingsOf` (source chip Install / Story / This chat,
  setup line, Experimental tag, check findings with Open setup -> This story > Play > Setup); `HelpHost` takes the snapshot from
  `PanelsHost`; snapshot gains `storyDeclares.commitments`; `isOn` removed from every mapped registry row (incl. the three divergent
  ones). No story: chips read "Default for new stories: ..." and Show me for a story feature goes to Orchestrator > Defaults
  (`defaultsWhere`/`helpWhere`); a Show me into a story page that cannot render without a story is not offered.
- S3: `meanwhile-proposals` copy (auto by default, Review waits, Off stops); curator, curator-markers and continuity-warden copy name
  their default mode; parity test reads the default from `defaultGlobalSettings()`; off-stage-event paragraph in the character-life
  topic (`story-guide.md`) and a short compact-twin line (800-char budget); `docs:guide`, `docs:settings` regenerated; Help `oneLine`/`what`.
- Fixes found live: `so-player-promises` added to Play routing (was routed to Author, `where.ts` `PLAY_TARGETS`).

Floors (informational):
- 24 frozen cases (`src/runtime/featureStatus.cases.ts`): Help / Features index + detail / control agreement 24 of 24 (jest).
- Author-only disclosures in player Help: 0 across the 24 (jest, `findingsByFeature` in player mode; model-role-outage with no player
  copy shows to the author only); live: no author-audience row in any player view.
- Show me, live (lane 41, no model): no story, player 48 offered / 44 reach, author 85 / 81, same at 1920x1080 and 390x844; loaded
  synthetic story (story `pacing: off`, chat `meanwhile.acceptMode: review`, chat `speakers: off`), player 66 / 48, author 107 / 87, same
  at both sizes. Every miss is a pre-existing conditional render, not a 09 row: content-dependent Play launchers (journal, stat sheet,
  widgets, memory search, carry, living save, promises list) on a story with no game layer or memory, and install-conditional targets
  (`so-announce-transitions`, `so-gpu-broker`, `so-judge-local-*`, `so-getting-started`, `so-cast-scene`, `so-character-life`,
  `so-living-scene-tests`, `so-author-view`). Mapped (FEATURE_STATE) rows: no story 7/7 player, 20/20 author (5 and 18 land on
  Defaults); story 7/9 and 20/22 (the two misses are npc-commitments and promises-remembered, content-conditional). Floor "all" NOT met
  because of those pre-existing targets; recorded, not retuned.
- Live chips matched `snapshot.features` and the Features index: pacing "Turned off by this story" [Story], speakers "Off in this chat"
  [This chat], meanwhile "Review before applying" [This chat]; no story never showed "Off in this chat".

Commands and results:
- `npm run gates:quick`: green (typecheck, typecheck:test, lint, jest related 1776/1776, replay --cached 32/32 killed).
- `npm run gates` (no --resume, on `00fd4959`): RED, both environment: `test-storybook:ci` EADDRINUSE :6006 (another v2.9 builder's
  Storybook), `test:debug` `childTree.test.mts` timing case under load. build, typecheck, typecheck:test, test (9824 passed, 1
  skipped), test:replay green.
- `npm run gates -- --resume` (same tree): `test-storybook:ci` EADDRINUSE again, `test:plugin` OpenCode boot timing case (load);
  build, debug:typecheck, lint, test:release, test:debug green.
- `npm run gates -- --resume` after :6006 was free (same tree): all green; test:plugin green, test-storybook:ci 156 suites / 945 tests
  (HelpPanel, FeaturePages pass). No full run without --resume is green; every step is green on this exact tree.
- `npm run build`: main `dist/index.js` 1,291,372 B (budget 1,300,000); Help stays in its lazy chunk.
- Live: isolated ST code copy `C:/dev/st-v29-09` (node_modules junctioned), staged with `stage.mjs --st-root`, lanes root
  `C:/dev/so-v29-09-lanes` lane 41 (data copied from an offline no-model lane), judge/images off; owner ST and lane 0 untouched.
  Sandbox chat deleted, story removed, overrides cleared, lane stopped.

NOT run: real-LLM rows: none in this plan (no model call). Campaign adoption: none (owner decision).

Deviations:
- Finding Show me opens the Setup list (where the step's own Show me and Fix live) instead of the step's raw target.
- Compact guide twin got a one-line mention only (topic at its 800-char budget).
- Unresolved questions answered: Ask's knowledge reports no on/off (it lists setting paths only), left as is; agency, prefetch and
  cardState have no Help row (reasons in `UNMAPPED_STORY_FEATURES`); the re-enable warning stays on the Features page only.

### GPU run 2026-10-22

- No real-LLM rows in this plan; nothing run.
