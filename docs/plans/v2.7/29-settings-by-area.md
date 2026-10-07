# Plan 29 — Settings by area

**Status (2026-10-07): BUILT on `v2.7-29-settings` (Gate record below; full gates deferred to the integrated run). SEEDED from the user (2026-10-07: "I really liked how the readme was structured, maybe we can
put the settings like that?"); applies the v2.7 01 triage; needs user approval of the triage table; not built.**
Overview: `00-overview.md`. Gate tier: D (implementation and acceptance; no model input changes).

## Problem

The settings panel (`src/components/settings/SettingsPanel.tsx:160-205`) is a column of 14 groups in build order:
story, memory model, display, images, sprites, lorebooks, stagecraft, judge, talk, pacing, capabilities. A player
cannot tell which groups matter to play, which are setup, and which are author tuning. The README's Features table
(`README.md:64-83`) already says the same things in eight areas, one line each, and reads well.

## Player outcome

The panel reads like the README: Start/Continue/Repair/Author on top (unchanged, `EntryPoints.tsx`), then one
section per area with a one-line description, the controls a player uses visible, everything else behind one
"Advanced" fold per section. Each section and control has a "?" that opens its guide page (v2.7 30).

## Design

1. **Areas are the registry's areas**, not a second list. `src/features/registry.ts` already tags every feature
   `area: play | memory | characters | world | judge | authoring | setup` (`registry.ts:99-443`). The README table is
   generated from the same registry (v2.7 01 close-out step Z), so README, Help and settings cannot drift.
   Rename for display only: Playing, Memory, Characters, World, Images (split `images`/`sprites`/`backgrounds` out of
   world), Judge, Authoring, Setup.
2. **One section component** (`SettingsArea`): heading, the area's one-line description from the registry
   (`settingsCopy.ts`), visible controls, `<details>` Advanced, and the guide link. Existing group components
   (`PlayGroups.tsx`, `MemoryModelGroup`, `ImageGroup`, `JudgeSettingsGroup`…) are re-homed, not rewritten.
3. **Audience decides placement:** `player` visible; `setup` visible in Setup; `author` visible only with Author view,
   otherwise absent (author view adds, never conditionally reveals; invariant). Lazy groups stay lazy.
4. **Apply the triage** (`01-docs-and-in-app-guidance.md` §Triage proposal, ~40 rows): `keep` / `advanced` /
   `dev-only` (behind `__SO_DEV__`, out of the release build) / `fixed default` (control **and** setting key removed,
   no-legacy rule). Rows for features added since 2026-10-03 (image route, sprite builder, mouth region, edit
   resolution, animated faces, card fields) are added to the table before the review.
5. **Repair reveal keeps working**: `revealSetting` targets by id; every id the check registry names
   (`runtime/checks.ts`, `checksSetup.ts`) must still resolve (test).

## Gates (D)

- Registry test: every settings control belongs to exactly one registry feature and area; every area has copy.
- Reveal test: every `target` a check can emit resolves to a mounted element in the matching audience.
- Removed `fixed default` keys: `getGlobalSettings` drops them; a stored value is ignored (jest).
- `dev-only` rows absent from the prod bundle (release inventory test).
- Storybook: `SettingsPanel` per persona (player, author) + a11y; `so-ui.mts assert-player-clean` on the live panel.
- Phase C live: settings round-trip (change → reload → read back) on a lane, ×2.

## Order

After v2.7 30's page ids exist (the "?" links), before 32–38 add controls (each later plan places its controls by
area from day one).

## Decisions for the user

1. Approve the triage table (v2.7 01 §Triage proposal) with the new rows. **Recommended: yes, as proposed.**
2. Images as its own area (split from World)? **Recommended: yes** — it is the largest optional setup.
3. Remember which sections are open per install (`localStorage`-free: extension settings)? **Recommended: yes.**

## Links

`01-docs-and-in-app-guidance.md` §D/§Triage proposal, `30-in-plugin-guide.md`, `README.md` §Features,
`src/features/registry.ts`, `src/components/settings/SettingsPanel.tsx`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. The v2.7 01 triage table is approved as proposed; new rows added at build.

## Gate record

2026-10-07, branch `v2.7-29-settings` (from `v2.7-image-track-wip` `8a9e06e3`). Built as decided: every
recommendation, the 01 triage table as proposed, new rows below.

### Built

- **Sections by area** (`SettingsArea.tsx`): `<details id="so-area-<area>" data-so="settings-area">`, summary = label
  + one line, a "?" (`menu_button fa-circle-question`, aria-label `Read the guide: <label>`) that calls
  `requestGuide(<doc>)` (falls back to the repo guide URL when no guide panel listens; `SettingsHost.openGuide` overrides
  it for stories), and an optional `Advanced` fold `#so-area-<area>-advanced`. Copy (label, one line, doc) is
  `SETTINGS_AREA_COPY` in `features/settingsCopy.ts`. Order = `FEATURE_AREAS`: Playing, Memory, Characters, World,
  **Images** (new registry area; `images`, `sprites`, `sprite-animation`, `backgrounds`, judge use `expressions` moved
  there from World), Judge, Authoring, Setup. EntryPoints unchanged on top. Old ids `so-current-chat`,
  `so-general-setup`, `so-author-services`, `so-diagnostics` gone; every control id kept.
- **Placement** (groups re-homed, not rewritten): Playing = story select/import, make-group card, group story,
  drawer button, Display (notes level + "Which notes", HUD, briefing, list marks), Pacing; Advanced = chat note.
  Memory = memory model group (+ its Advanced: cadence, lag, knowledge tracking, models per task), chapters, warden
  (Author view). Characters = voices per turn; inner voice (dev only, Author view). World = lorebooks (switching mode
  and memory-triggers-lore under its Advanced), curator. Images = image service, sprite stage. Judge = judge group.
  Authoring = wizard switch (shown when `authoringSettings`, as before; otherwise the section is absent). Setup =
  capabilities + engine status (Author view). Registry `where.label`s and `memory-test` / `reply-thinking` /
  `models-per-task` areas (setup → memory) follow the controls.
- **Open sections remembered** per install: new `help.openSections: string[]` (default `["play"]`, sanitized:
  strings, trimmed, deduped, `[a-z]+` only; owned by the `help` feature). No localStorage.
- **Copy**: "Turn on the wizard under Authoring", README quick start / Features table (`Images` row), guide pages
  (`README`, `setup/README` section list, `setup/judge`, `setup/memory-model`, `author/studio`, `author/wizard`);
  `npm run guide:build` regenerated `src/guide/pages.generated.ts` (56 pages).
- **Harness**: `so-ui.mts revealSettingsControl` opens `#so-area-memory` first; `laneLoadAndStops.test.mts` fixture
  and `j1-first-contact` (two steps) point at `#so-area-memory`.

### Triage, as applied

| Row | Call | Applied |
|---|---|---|
| Stories, group binding, drawer/Memory tab, HUD, notes level, recap, speaker direction (drawer), voices + max, pacing hint, memory model + fallback, reply thinking, memory test, warden + mode, curator + mode, global-lore Repair row, judge key/on, wizard, illustrations core, sprite on/stage, capabilities | keep | visible in their section |
| Notes kinds + window | advanced | already in "Which notes" fold |
| Chat note when the story moves on | advanced | Playing › Advanced |
| Chapters seal / story so far / fold / budget | dev-only | `ChapterRecordControls.tsx`, lazy only under `__SO_DEV__`; release build reads them at their defaults |
| Chain stop on scene change, hold reading | fixed default | control, copy and `talk.chain.{stopOnTransition,holdExtraction}` removed; `TALK_CHAIN_FIXED` fills `getTalkChainConfig` (checkpoint `talk_control.chain` overrides unchanged) |
| Pacing smoothing α | fixed default | control, copy and `pacing.alpha` key removed; the runtime view keeps `PacingSettings.alpha = DEFAULT_TENSION_EMA_ALPHA` (deviation 1) |
| Reading cadence, wait before newest | advanced | already in Memory › Advanced |
| Look further back (reconcile ×) | fixed default | control, copy, key removed from settings, `ExtractionRuntimeSettings`, `SchedulerSettings`; `RECONCILIATION_MULTIPLIER = 1.5` in `boundaryWork`; `so-run-header` field, two scenarios, j11 evals, `baseline-settings.json` and 25 test fixtures updated |
| Knowledge tracking, models per task | advanced | already in Memory › Advanced |
| Inner voice (harvest, beat, fan-out) | dev-only | `InnerVoiceControls` lazy only under `__SO_DEV__`, in Characters (Author view) |
| Lorebook switching mode | advanced | already folded |
| Memory can trigger lore | advanced | moved into the switching-mode fold |
| Judge uses list, provider per use, house rules | advanced | already in "What the judge is used for" |
| Judge uses exclusive lore, sprite expressions | dev-only | `offeredJudgeUses` hides them outside `__SO_DEV__`; release build reads both off |
| Outlines per gap + picked by | advanced | Judge › "Outlines for the road ahead" fold (Author view) |
| Illustrations picture types, fallback looks; sprite model/dim/breathing | advanced | already folded |
| Experiments (`spikes.*`) | dev-only | unchanged (no prod control) |
| Tier budgets, depths, weights, judge model/timeout | fixed default | unchanged (no control) |

New rows (features since 2026-10-03):

| Row | Audience | Call | Why |
|---|---|---|---|
| Image route (backend: SillyTavern / ComfyUI recipes) | setup | keep | needed to set images up at all |
| Sprite builder (Studio › Sprites) | author | keep (Studio) | not a settings control; experimental, already Author-only |
| Mouth replacement region (Studio) | author | keep (Studio) | same |
| Sprite edit resolution (Studio) | author | keep (Studio) | same |
| Animated faces (mouth movement, blink) | setup | advanced | cosmetic tuning; already in the sprite Advanced fold |
| Card fields: current character state in replies (`sprites.cardOverlay`), on-demand looks | setup | advanced | optional, off by default; stays in the sprite Advanced fold (deviation 3) |
| In-plugin guide | player | keep | the "?" on every section opens it; `/story guide` unchanged |

### Release-build dev-only defaults

`withoutDevOnlySettings` (in `sanitizeGlobalSettings`, release build only): drops `memory.innerBeat/innerFanOut/
harvestReasoning` and `memory.chapters.{seal,storySoFar,fold,chronicleTokens}`, forces `judge.uses.loreExclusive`
and `judge.uses.expressions` off. Without it a stored or default-on value would keep running with no control to turn
it off. Dev builds (jest, lanes) keep stored values.

### Commands and results

Testing policy (coordinator, 2026-10-07): grouped development, full gates deferred to the integrated run after the
merge, so `npm run gates`, `npm run build`, `npm run test:release` and Storybook were NOT run here.

- `npx tsc --noEmit`: clean. `npx tsc -p tsconfig.test.json`: clean. `npm run lint`: clean.
  `npm run debug:typecheck`: clean.
- `npx jest` on the touched areas: `src/features` + `src/components` + `src/extraction` + touched runtime tests
  (66 suites, 776 tests) and a second set (settings, judge, checks, playerSurfaces, extras, … 45 suites, 540 tests):
  all green after updating `playerSurfaces.review` M5 (the author half now renders `ChapterRecordControls`).
  New `src/features/settingsAreas.test.ts` (11 cases): area order and copy, guide pages exist, one section per area
  in order, every settings feature sits in its own area's section (named exceptions: `private-knowledge` in Memory,
  `road-ahead` in Judge, judge uses in Judge), removed keys dropped from stored values and defaults, fixed constants,
  dev-only stripping (release vs dev), dev-only judge uses offered only in dev, dev-only lazy imports, open-section
  sanitizing.
- `node --test` laneLoadAndStops, so-ui, release debugSurface (D4 skipped without builds), presetOverlay,
  sessionBaseline / Runbook / Setting / Charters: all pass.
- **New, not yet run**: release `D4` (prod bundle has no `so-inner-fanout` / `so-chapter-fold` /
  `so-chapter-story-so-far`, dev bundle has them) needs `npm run build` + `npm run build:dev`; Storybook stories
  (`SettingsPanel`: player/author sections, "?" button, Advanced fold, remembered sections; `ChapterControls`,
  `ChapterRecordControls`, `JudgeSettingsGroup`, `PlayGroups`, `WorldInfoGatingGroup` updated for the release-build
  flag Storybook runs with). Both in the integrated run. Storybook cannot find stories from a worktree path anyway.
- Live gate not run (Phase C settings round-trip ×2 and `assert-player-clean` on the live panel stay owed).

### Deviations

1. `PacingSettings.alpha` stays on the in-memory runtime view (always `DEFAULT_TENSION_EMA_ALPHA`): the pacing
   coordinator and its tests read it, and a test varying it is a legitimate consumer. The install key and control
   are gone. Same for `TalkControl`'s `system.stopOnTransition/holdExtraction` (tests vary them; the install fills
   them from `TALK_CHAIN_FIXED`).
2. Release builds now read exclusive lore selection and sprite expressions **off** (were on by default). This changes
   what the release build sends to the judge; the triage row says "keep it off" and no control could turn them off
   otherwise. Lanes run the dev build, so session evidence is unaffected.
3. Rows not moved to their registry area, because moving them would split a group component: knowledge tracking
   (Characters feature) stays in Memory › Advanced with the memory model; outlines per gap (Authoring feature) stays in
   Judge; card fields (`sprites.cardOverlay`) stays in the sprite fold under Images. Recorded as test exceptions.
4. Design point 3 ("author audience absent without Author view") is applied through the existing gates only
   (`authoringSettings`, `authorView`), not extended: pacing hint stays visible to players, as the triage says keep.
5. No generated settings reference exists (`docs/guide/setup/settings-reference.md` is still the placeholder, no
   `docs:settings` script); the README Features table is hand-edited (Images row). Generating both stays with v2.7 01
   step Z.
6. The thinking check's target `so-inner-harvest` mounts only in a dev build (inner voice is dev-only); the check
   cannot fire in a release build because it needs `harvestReasoning` on.

### Open items

- Integrated run: full gates, `npm run build && npm run test:release` (D4), Storybook.
- Help panel lists the dev-only features (inner voice, chapters records) in a release build; their Show me finds no
  control. A `devOnly` flag on registry features would hide them.
- Phase C live: settings round-trip on a lane ×2, `assert-player-clean` on the live panel.

## Review 2026-10-07 (Sol)

Source: v2.7 39 §Review 2026-10-07 (Sol). Both tasks below are owned by this plan and due before the v2.7 39 freeze
(B3). v2.7 39 C2 checks the rendered result.

| Finding | Change | Where |
|---|---|---|
| 20 | **Help availability filtering:** registry features gain an availability flag (`devOnly`, or a predicate over the build and capabilities). A release-build Help lists only features whose control can mount. "Show me" renders only when its target exists in the current build and persona, and otherwise points to the guide page. Test: a release-build fixture where every listed "Show me" target resolves, plus a planted dev-only feature that must not appear | §Open items (the dev-only Help entries) |
| 20 | **Settings reference owner:** a `docs:settings` script generates `docs/guide/setup/settings-reference.md` and the README Features table from the registry and settings areas; a drift test fails on a hand edit. Deviation 5 is closed here, before 39 Z, instead of "stays with v2.7 01 step Z" | §Deviations 5 |

### Finding 20 built (2026-10-07, branch `v2.7-finding-20`)

- **Availability filtering: not built, by decision.** The prod/dev split is being removed in parallel (one build,
  everything shipped), so a `devOnly` flag would filter nothing. Replaced by a target check:
  `src/features/showMeTargets.test.ts` walks the render tree from each surface's mount in `src/index.tsx`
  (`SettingsRoot`, `DrawerPanel`, `StudioHost`, `HudMount` + `InlineMount`): JSX tags resolved through imports, path
  aliases and `lazyRetry(() => import(...))`, then asserts every registry feature's `where.selector` is defined by a
  file that surface renders (`id` literal, id string in a map, or `` `so-…${}` `` template; `[data-so="…"]`).
  Controls: a missing id, an id on another surface (drawer `#so-memory-search` read as settings) and an id defined only
  by an unrendered file all fail. A full jsdom mount was not used: the panel and drawer need the STAPI mock and a
  near-complete snapshot, and the static tree catches the same class (a target nothing mounts).
- **Broken targets found and fixed:** `private-knowledge` pointed at `#so-self-test` (the test button, not its
  control) → `#so-epistemic-capable` (Memory › Advanced); `continue-list` pointed at `#so-continue-list`, which is not
  rendered when the list is switched off → its switch `#so-presence-continue-list`. `inner-voice` (`#so-inner-beat`)
  mounts only behind `__SO_DEV__ ? lazyRetry(...)` today; the check accepts that form because the split removal ships
  it.
- **Settings reference owner (deviation 5 closed):** `npm run docs:settings` (`scripts/docs/settings-docs.mjs`, esbuild
  over `src/features/settingsReference.ts`, now a direct devDependency) writes `docs/guide/setup/settings-reference.md`
  (one section per area, one row per `SETTING_COPY` key: label, where, help, default, key) and the README Features
  table between `<!-- features:start … -->` / `<!-- features:end -->` (every feature but the individual judge uses,
  with status), then rebuilds the guide bundle. Drift: `src/features/settingsReference.test.ts` fails on a stale or
  hand-edited file, with a planted-edit control.
- C2: `C2-rendered-targets` (39 + `test/phase-c/manifest.json`) now checks rendered targets on the one build; the
  planted dev-only prerequisite is gone.
- Gates (2026-10-07): `npm run gates -- --no-storybook`: all green in 117.8s (typecheck, build 1,178,573 B main
  under the 1,250,000 B budget, build:dev, test 592 suites / 6929 tests, lint, typecheck:test, debug:typecheck,
  test:replay 32/32 killed, test:debug, test:plugin, test:release). Storybook skipped (`--no-storybook`): it cannot run
  from a worktree, so the new stories are written, not run. Live C2 rows not run.
