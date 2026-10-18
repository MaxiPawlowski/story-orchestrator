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

## Redesign 2026-10-18: coach marks on the real UI, quick start as the entry point (branch `v2.8-tour-coach`)

The owner rejected the three-column tour dialog (layout, presentation, navigation; the fake example mocks were unclear)
and chose "A + C".

### What changed

- **A. Coach marks** (`src/guide/tour/`, lazy chunk): a ring around the real control plus one card ("Step n of m",
  title, one or two sentences, **Skip tour**, **Back**, **Next** / **Done**). Three flows of 4–7 stops
  (`coachFlows.ts`): Player 7 (route icon, Library, Play, What the story remembers, repair card, the strip above the
  chat box, Help), Author 6 (Author view, Review, the wizard, Open Studio, the Studio's Wizard tab, Validation), Setup 6
  (memory model, Test memory model, judge key, Defaults, one feature card, the setup path page). A stop runs an action
  first (`workspaceNavigation.open`, back to the chat, open the Studio, open a guide page), then looks for its anchors
  for 3 s; the first shown anchor wins (an `alt` anchor switches to the stop's alternate text, e.g. Author view already
  on). Missing or hidden: the card says so in plain words and keeps **Next**. Closed `<details>` ancestors are opened;
  a target summary's own details is not.
- Top layer: the card is a `popover="manual"` element portaled into the topmost open modal dialog, else `body`
  (a modal dialog makes everything outside it inert, and ST's `html` transform breaks `position: fixed`). Verified live
  inside the workspace, the Studio and over the plain chat. Repositions on resize, scroll (capture), visual viewport,
  DOM mutations and target resize. Under 700 px the card is a sheet at the bottom, or the top when the target is low.
  Escape (capture listener) closes the tour only; the workspace stays open. Focus goes to **Next** on every stop and
  back to the opener on close.
- Entry points: **Orchestrator → Help** now has **Quick start**, **Take the tour** (opens a chooser card: Playing a
  story / Writing stories / Setting up), **Setup path** (closes the workspace, opens the guide page);
  `/story tour [player|author|setup]` starts a flow; the floating Help panel's **Take the tour** opens the chooser.
- Removed: `TourDialog`, `TourStep`, `TourMocks`, `TourFinder`, `TourGuideReader`, `TourText`, `tourProgress`
  (self-reported "tried" progress), `tourSteps`, `setupPath.ts`, `tour.css`, `dialogEvents.ts`, `#so-tour-root`,
  `#so-tour-modal` (and their style-scope entries).
- **C. Quick start** (`docs/guide/quick-start.md`) is the one entry point: a five-item checklist (memory model, group
  chat, import or start a story, play a turn, where memory and repair live) with current workspace paths. In-app
  markers ride HTML comments, so the website (and the guide site renderer) shows a plain numbered list:
  `<!-- so:check memory|group|story|reply -->` ticks from real state (`src/guide/quickStart.ts`: memory model set, a
  group chat open, a story loaded there, a reply committed), `<!-- so:show <view>:<stop> -->` starts that tour stop,
  `<!-- so:show open:<context>.<page>.<control> -->` opens the workspace at a control (a `so-feature-*` control on
  Defaults or Features opens its card). Install now links the canonical `setup/README.md#install`.
- **Setup path** (`docs/guide/setup/setup-path.md`) rewritten as a readable roadmap: levels 0–6, each step four
  bullets (what it does, cost, where, how to check) with a **Show me**, level 5 one table row per feature; no element
  ids in the prose.
- `GuideMarkdown` renders the markers only when the reader passes `actionLabels` (the guide site passes none);
  `GuideHost` takes the snapshot and whether a group is open from the floating guide panel, and closes the panel when
  a Show me runs.
- Small fixes on the way: ids `so-open-memory` (Play → What the story remembers) and `so-studio-task-<task>` (Studio
  task buttons); the docked floating panel (phone width) sat above the screen (`bottom: 0` against ST's collapsed
  `html` containing block), now `top: 40vh`; Help buttons keep one line.
- `docs/dev/style.md`: tours are coach marks on the real UI (rule added), in-app guide markers documented.

### Tests

- `src/guide/tour/coach.test.ts` (jsdom): request door (view and stop); flows 4–7 stops, unique, copy for every stop,
  at most two sentences, alt copy exactly where an alt anchor exists; copy has no jargon, ids, paths or keys (planted
  control); geometry (below, above, right, left, over, centre, bottom and top sheet, ring clamp, find/hidden/missing,
  details opening, own summary details left closed, modal host); host actions (workspace, chat, guide, Studio opened
  once and closed only when the tour opened it); quick-start state truth table; the quick-start page carries one check
  per item; markers render in the app and not on the website; every guide Show me names a flow stop (planted control);
  setup path structure (levels, four bullets per step, every feature once in level 5, no ids, claims vs code).
- `src/features/showMeTargets.test.ts`: every coach anchor id is rendered by the tree its stop shows (workspace,
  Studio, chat, guide; planted control); every `open:` Show me lands on a control the workspace renders.
- Storybook `Tour/CoachMarks` (SetupFlow, Choose, NotOnScreen, AuthorViewAlreadyOn, InsideAModalDialog, PhoneSheet,
  PhoneTargetLow) and `Panels/GuideReader` `QuickStartChecklist`, play tests + axe.
- `scripts/debug/so-tour-check.mts` rewritten: walks every stop of each flow with real clicks, records state,
  placement, focus and Escape behaviour; help and quick-start checks; screenshots per stop.

## Gate record 2026-10-18 (branch `v2.8-tour-coach`)

- Final, after merging master 5475068d: `npm run gates -- --jobs=1 --no-storybook` all green in 378.0 s (test:replay,
  test 9,718 passed / 1 skipped, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin,
  test:release); Storybook skipped there and run on its own port (below), 153 suites / 929 tests green.
- Red runs on the way, all fixed: `codeHealth.guard` (CoachMarks too long and branchy, split into hooks; two long
  lines), `errorCopy.guard` (three silent catches: one logs now, the `:modal` probe uses `CSS.supports`), lint max-len
  in a story, `test:release` guide-site (the guide site renderer imports `GuideMarkdown` without path aliases; labels
  now come in as a prop), `test:debug` (stale gitignored `test/sessions/adolion-stories.json` after the pin moved).
- Storybook: static build, served on port 6294, `test-storybook --maxWorkers 1`: 153 suites, 929 tests passed (axe
  included). The first run had two axe colour-contrast failures from story stage markup (unstyled dialog and tabs).
- Main bundle 1,286,600 B after the final merge (budget 1,300,000 B); the coach chunk is 22,962 B with its stylesheet.
- Live, plumbing only (no model in this feature): private ST copy `C:\dev\st-live-tour` (ST 1.19.0), no-model lane,
  images and sprites off, a chat in the bundled example's group with the example story imported and one committed
  reply (`/sendas`). Earlier runs on lane 88 moved to lane 84 after lane 88's port 8188 collided with ComfyUI (lane 88
  stopped). Served `dist/index.js` sha256 `b6274a354f03…`.
  `ST_DEBUG_VIEWPORT=1400x900` and `390x844`, `node scripts/debug/st-lanes.mts run 84 -- scripts/debug/so-tour-check.mts all`:
  player 7/7, author 6/6, setup 6/6 stops found at both sizes (sheet mode at 390), card in view, focus on Next, no
  horizontal scroll, Escape closed the tour with the workspace still open; quick-start checks matched real state
  (4/4 ticked) and Show me started the setup stop with the guide panel closed. Help (narrowed to the three tour entry
  points; Help and Ask and Open the guide arrive with `v2.8-ui-gaps-integrate`): chooser, Setting up, Setup path page,
  both sizes green; after merging master (5475068d) the Help row is one set, Quick start, Take the tour, Setup path,
  Help and Ask, Open the guide, re-checked at both sizes (`…11-41-04-137Z-lane84-help3-1400x900\`,
  `…11-41-09-562Z-lane84-help3-390x844\`, served `326a524e81a1…`). `so-ui.mts assert-player-clean`: ok (the first run flagged "Blackboard" in the setup path page left
  open in the guide panel; reworded, and the check closes the panel). Records:
  `C:\dev\so-live-lanes\84\debug\tour\2026-10-18T11-03-10-316Z-lane84-1400x900\`, `…11-13-25-095Z-lane84-390x844\`,
  `…11-27-11-601Z-lane84-help2-1400x900\`, `…11-27-18-715Z-lane84-help2-390x844\`.

### Unresolved questions

- Should a Show me in the floating guide panel keep the panel open beside the coach card on wide screens?
  Recommended: no; it closes so it never covers a target.
