# Plan 72: the tour, the setup path and one style guide

Owner asks (2026-10-17): the handbook as a quickstart that complements the guide and links into it; the same style
guideline everywhere; a roadmap-like, stepped recommendation for enabling and configuring every feature.

Branch `v2.8-tour-setup-path`, worktree `../so-tour`, lane 88 on the private ST copy `C:\dev\st-live-tour`. CPU only.

## What was built

- **In-plugin tour** (`src/guide/tour/`, its own lazy chunk). Three views: **Player** (9 steps), **Author** (8), **Setup
  path** (26, levels 0–6). Each step: Do this / You should see / If it looks off, a **Read more** button that opens the
  in-app guide reader at the page and anchor (a nested native dialog over the tour, `#so-tour-guide-reader`), the
  matching `/story guide <page>` command to copy, and an example that keeps only its own state. Setup steps add what
  the step unlocks, what it costs and an **Open this setting** button that closes the tour and calls
  `workspaceNavigation.open({context, page, feature, control})`; level 5 lists every feature with its own button.
  A finder (`/`, nested dialog) searches every step of every view.
- Entry points: **Orchestrator → Help → Take the tour** (`#so-help-tour`) and **Setup path** (`#so-help-tour-setup`),
  **Take the tour** in the floating Help panel, and `/story tour [player|author|setup]`. The main bundle gets only the
  door: `src/guide/tour/request.ts` (listener set, like `src/guide/request.ts`), the slash verb and one
  `onTourRequest` line in `src/index.tsx` that imports `tourMount.tsx` on first use.
- Root `#so-tour-root`, dialog `#so-tour-modal` (native `<dialog>` + `showModal()`), both in the `src/styles.css` scope
  list; Storybook `Tour/*` titles mount in `so-tour-root`. `tour.css` reuses the workspace frame and only ST theme
  variables and `--st-*` tokens; the player view takes the quote accent, author and setup the em accent.
- Progress per device: `story-orchestrator.tour.<user>` in `localStorage`, every read and write in try/catch, keyed by
  user like the device preferences. The device-preferences store itself did not fit: it accepts only validated
  setting paths (`DEVICE_SETTING_PATHS`), and tour progress is not a setting.
- Feature registry entry `tour` (setup area, player audience, Show me lands on `#so-help-tour`), `HELP_COPY.tour`,
  `TOUR_COPY` and its terms in `src/features/tourCopy.ts` (in the registry's player copy checks).
- **Setup path page** `docs/guide/setup/setup-path.md`, linked from the guide README, the quick start and the setup
  README. Every claim was checked against `src/features`, `src/runtime/settingsModel.ts`,
  `src/runtime/featureResolve.ts`, `src/runtime/featureControls.ts` and the settings reference; the defaults it quotes
  are asserted in `tour.test.ts`. One correction found on the way: the character stage is not off by default; it
  resolves to **Automatic** (on when a story directs the stage), so every feature is on by default.
- **Style guide** `docs/dev/style.md` (colour, type and controls, layouts, copy, docs and screenshots), linked from
  `docs/dev/contributing.md`. The contributing page also lost its stale two-build text (one build since v2.6, budget
  1,300,000 B).
- Docs gaps the tour exposed: `player/drawer-and-hud.md` gains **Author view tabs** (Blackboard, Scheduler, Payload and
  the next-reply preview had no page); the quick start's memory-model path now names **Connections**.

## Tests

- `src/guide/tour/tour.test.ts`: request door; progress store (round trip, per user, broken entry, throwing store, no
  store); routes (unique ids, filled blocks, mocks and terms resolve, search); **drift**: every Read more target is a
  bundled guide page and its anchor a heading there (planted control), the setup path page names every setup control
  and every level-5 row with the tour's own cost and turn-off text, the index pages link it; the setup claims against
  the code (every feature enabled by default, only the stage automatic, the quoted defaults); player copy has no jargon,
  ids, paths or keys (planted control); the examples import nothing that writes and only `tourMount.tsx` touches ST or
  the workspace; static render of every example and of a step (Read more is a button, never a link out).
- `src/features/showMeTargets.test.ts`: every control a tour step opens is defined by the workspace tree.
- `src/runtime/slashCommands.test.ts`: `/story tour` with and without a listener, a view, and a usage error.
- `src/features/registry.test.ts`: the verb list and the tour copy in the player copy checks.
- Storybook: `Tour/Dialog`, `Tour/Step`, `Tour/Mocks`, `Tour/Finder`, `Tour/GuideReader` with play tests, and
  `Settings/HelpPanel` `TakeTheTour`.

## Unresolved questions

- Should the tour's Read more also offer the floating guide panel when the tour is closed? Recommended: no; the
  reader inside the tour keeps the user's place, and Help still opens the full guide.
- Should the tour open on its own once, after the first memory model is set? Recommended: no for now; the Start card
  already says what is missing, and an unasked dialog over a fresh install is noise.

## Gate record 2026-10-17 (branch `v2.8-tour-setup-path`, base master `e8515714`)

- `npm run gates -- --jobs=1 --no-storybook`: all green in 275.7 s (test:replay, test 9,712 passed / 1 skipped, build,
  test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release). Storybook was skipped there
  and run separately. The first gates run was red on two guards (`errorCopy.guard`: three silent catches;
  `codeHealth.guard`: one duplicated dialog-cancel body); fixed (catches log, shared `dialogEvents.ts`), then green.
- Storybook: static build, served on port 6293, `test-storybook --maxWorkers 1`: 156 suites, 955 tests passed (axe
  included). Two fixes on the way: the guide reader's `so-guide-*` styles now include `#so-tour-modal` (nav buttons
  failed contrast), and the example chat log is focusable when it scrolls.
- Main bundle: 1,286,093 B against 1,285,188 B on master (+905 B: the request door, the slash verb, one Help label).
  The tour, its examples, setup data and stylesheet ride their own lazy chunk.
- Live, plumbing only (no model call in this feature): lane 88, offline no-model seed, private ST copy
  `C:\dev\st-live-tour` (ST 1.19.0), served `dist/index.js` sha256 `73403537f196…`, manifest source `844edace14a0…`.
  `node scripts/debug/st-lanes.mts run 88 -- scripts/debug/so-tour-check.mts all`, twice: help (Help → Take the tour
  opens the tour), setup (`/story tour setup`, The memory model, Open this setting → tour closes, workspace on
  Orchestrator → Connections with `so-extraction-profile` focused), read-more (Stuck? → reader opens on
  "Starting, continuing and restarting" with the anchor in view, no GitHub link outside the reader): 3/3 both runs.
  `so-ui.mts assert-player-clean` after each run: ok, no findings, both runs. Records and screenshots:
  `C:\dev\so-live-lanes\88\debug\tour\2026-10-17T12-24-36-074Z-final2-run1\` and `…12-24-44-543Z-final2-run2\`.
- Found live: the guide reader inside a dialog did not scroll to its anchor when the reader chunk was already loaded
  (the child's scroll effect ran before the parent's `showModal`). The tour reader now opens in a layout effect; the
  Studio's guide dialog has the same order and was left alone (outside this plan).
- No story-guide change: the tour adds no authorable field. Plan 24 matrix row `tour` added; coverage 124 green, 0 red.
