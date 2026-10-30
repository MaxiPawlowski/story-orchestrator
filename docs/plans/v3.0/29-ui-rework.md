# v3.0 29 — UI rework

Owner 2026-10-30: the UI is outdated, too many accordions, hard to navigate or configure. Review of the live UI on no-model
lanes: `ui-review/settings.md`, `player.md`, `inchat.md`, `author.md`, `design-system.md`. Summary page with mockups:
`ui-review/ui-rework.html` (published as an artifact for the owner).

## Decisions (owner 2026-10-30: "yes to all")

1. Accent = the theme's `--SmartThemeQuoteColor`; status colours derived once (`--so-ok/warn/error/info`).
2. Switches for on/off, segmented controls for small enums, checkboxes only for multi-select lists.
3. Density: 36 px controls on `pointer: fine`, 44 px on touch.
4. Workspace stays a native `<dialog>`, translucent with ST blur, content width about 1,200 px.
5. One tabbed story sheet docked right of the chat (pop-out kept); bottom sheet with snap points on mobile, capped so the
   last reply stays visible.
6. Inline notes at player level: one quiet line of words, expands on click; legend moves to Help, raw data to the inspector.
7. Contexts renamed "This chat" / "Settings"; player nav = Play + Settings; Author view switch lives in Settings.
8. Per-device display settings kept, as a "this device" chip on the row (no second list).
9. Start pane: briefing first, then identity as one control, then one primary Start.
10. Author: sticky Steer column + question-named sections; inspector as a panel beside the chat; Studio left nav,
    graph beside the editor, one page per character, Offers as a row editor (JSON escape hatch).
11. Expert settings always reachable on sub-pages; no expert-mode switch.

## Phases

- **0** direction-neutral fixes: 0a style (tokens, CSS scope, Extensions block, status dots), 0b behaviour (judge scope,
  HUD fallback, inline legend/raw JSON, Help header + breadcrumbs, 1:1 notice, life-key validation, no-model lanes).
- **1** kit: `src/components/ui/` (design-system WP-2, WP-4, WP-5, WP-6): Button, IconButton, Switch, SegmentedControl,
  SettingRow, Section, Tabs, NavList, Card, Badge, Callout, StatusDot, EmptyState, Skeleton, Field, SearchField,
  Dialog/Sheet; each with a story.
- **2** areas in parallel on the kit: Settings (S3-S9), Player (P-1..P-6, P-8, P-9), In chat (IC1-IC9), Author console
  (A2-A4), Studio (S1-S6). Shared: one FeatureList for Settings, This chat → Settings and Studio features; one story-sheet
  tab body set used by the sheet and by Play's tabs.
- **3** clean-up: buttons/alerts migration leftovers (WP-3), CSS split + lazy styles (WP-7), harness selectors, guide and
  settings docs, screenshot pass desktop/mobile, dark/light.

Harvest 2026-10-30 additions (owner asked what is worth building; `extension-research-2026-10-30/SUMMARY.md`), folded into
phase 2: in chat, a "Here now" story-sheet tab from `runtime/sceneCard.ts` `sceneView`; the status chip says what a read waits
on, bounded into Try again; Settings feature rows name the model and what the feature writes; Author, a who-knows-what grid
(Author view only) with an alert when a kept-out member is on stage.

Each work package closes on full `npm run gates` plus a lane screenshot check and `so-ui.mts assert-player-clean`.

## Phase 0a gate record

2026-10-30, branch `v3.0-29-ui-p0-style` (code commit `184d1607`, then master's docs-only `0bbea454` merged in).

- Built: `src/styles/tokens.css` (`--so-*` from `--SmartTheme*`, `--black30a/70a`, `--animation-duration`; `--so-ok/warn/error`
  = fixed hue 60% mixed in oklab toward `--SmartThemeBodyColor`, contrast >= 4.1 on light, >= 6.4 on dark); `--st-*` re-pointed,
  no caller change; workspace/Studio sheet/game/sprite/image literals gone; `border-white/10` (42) -> `border-[var(--so-line)]`;
  busy spinner and media/sprite pending scoped to mount roots; `.so-settings-*` also under `#so-workspace-modal` (S1);
  `components/settings/ExtensionsBlock.tsx` as an ST `.inline-drawer`, no utilities on `#story-orchestrator-settings`, ids kept (S2/F3);
  `components/drawer/StatusDot.tsx` tone + icon + word (A3). `openInlinePanel` kept: not dead (ST extension Show me targets).
- Guard: `src/runtime/styleTokens.guard.test.ts` (colour literals outside tokens.css and the accent table, palette utilities,
  fake SmartTheme vars, utilities on a mount-root element; planted controls).
- Harness: `so-ui.mts openExtensionSettings` and `live-v19-repair-deep-link.json` open the collapsed inline drawer before
  pointer clicks / hit-tests on `#so-open-workspace` / `#so-open-setup`.
- Visual: lane 35 (no-model, images/sprites/living/judge/extraction off, unchanged), worktree `dist/` routed into the lane
  browser (nothing staged), SO-UI cards + group + `factions.story.json` as `SO-UI Factions lab`, cleaned (leaked 0, library 0,
  theme `Dark V 1.0` kept; light = unsaved inline overrides), 0 model calls. `C:\dev\so-lanes\ui-review\p0-style\`
  before/after x desktop/mobile x dark/light. Probes: Extensions buttons clipped before, not after; area guide `?` static ->
  absolute; status dots one colour -> ok/error tones.
- Bundle: main `dist/index.js` 1,264,321 B (budget 1,300,000).
- `npm run gates:quick`: green. `npm run gates` (no `--resume`, Storybook included): all green in 479.1s (build, typecheck,
  test:debug, test, typecheck:test, test:replay, test:release, debug:typecheck, test:plugin, lint, test-storybook:ci 169 suites /
  1014 tests).
- Open for phase 1: workspace backdrop is the theme tint stacked opaque (decision 4 translucent + blur belongs to WP-6).

## Phase 0b gate record

2026-10-30, branch `v3.0-29-ui-p0-behaviour` (code commit `f7f8b67d`, master `6fd23cf6` with phase 0a merged in at `1088cd46`).

- Judge scope (settings S2): This story → Features lists judge uses read-only (`[data-so="feature-judge-uses"]`, rows
  `[data-judge-use]`, no checkbox) with `[data-so="feature-judge-open"]` → `judgeIntent()` (Connections, `#so-area-judge`
  opened). No per-chat judge override exists, so read-only + link. Defaults keeps the editable checkboxes.
- HUD (inchat F1): `narrative.ts` `sceneHeadline` = `player_name` → open chapter title → story title → "Current scene";
  `NarrativeStatus.headline` feeds `#so-hud-main` and `#so-hud-card-title`; Author view adds the checkpoint name muted
  (`[data-so="hud-author-checkpoint"]`). The away recap's "Where you are" line follows (j4 J4.3 expects the story title).
- Inline (F4/F5): the legend panel renders below the chip row (sibling of `.so-inline-chips` in `[data-so="inline-strip"]`);
  inline detail stops at level 3 (`INLINE_DETAIL_LEVEL`), level-4 raw detail (blackboards, prompts, payload keys) only in
  `#so-inspector`.
- Help (F8): `HelpPanel`/`HelpHost` `hosted` drops the second header and `[data-so="help-close"]` inside `PanelFrame`.
  Breadcrumbs come from `workspaceRoutes.ts` (`WORKSPACE_PAGES`, `WORKSPACE_CONTEXT_LABELS`, `workspaceCrumb`), shared with
  `WorkspaceShell` and `settingsReference.ts`; `drawerAt` on a `#so-feature-<id>-` selector now opens Features (was Author).
  `workspaceRoutes.test.ts` fails a Where line whose page is not the page Show me opens.
- 1:1 chat (player P4): `noGroupView` answers in every one-on-one chat (`storyId` null until a pick); `story-needs-group`
  still fires only with a story. Play page heading = state (`[data-so="play-page"][data-state]`: playing / no-chat /
  no-group / no-story), `#so-play-make-group` card in a 1:1 chat.
- B7 confirmed and fixed: `undeclared-quality` flagged `rel_arin_player_trust` (character-life fixture) as blocking.
  `studio/compiledQualities.ts` adds the engine's compiled living/reward/life/codex/observation/check keys to the Studio
  quality map; a typo key still blocks.
- No-model lanes: `st-lanes.mts no-model` also writes `REMOTE_AUTHORING_PATHS` (living, branching, prefetch, create,
  briefing draft, polish) false, reads back, keeps prior values in `so-no-model-settings.json`; `restore-model` restores
  them exactly (absent stays absent); re-running `no-model` on a no-model lane re-applies the settings. The offline seed
  switches them off too. A `lane: "no-model"` scenario is not-runnable while one is on or a role has a harness route
  (`facts.remoteAuthoring`). Harness routes assigned by hand are reported, not rewritten. `laneNoModel.test.mts`.
- Live: lane 31 (offline no-model; images/sprites/living/judge/extraction off, read back), worktree `dist/` routed into the
  lane browser (nothing staged), SO-UI-B cards + group + synthetic story with no `player_name`: HUD `◈ SO-UI-B Lantern Road`,
  card title same, author line `cp-road-internal` only in Author view, `assert-player-clean` ok (0 findings), Features
  speakers judge rows 0 checkboxes and link opens `#so-area-judge`, Help panel 0 `help-close` / 1 `panel-close` with
  `Orchestrator › Library › Playing › Story for this chat`, 1:1 chat `noGroup.storyId` null and Play heading "Stories play in
  group chats" with the card; 0 model calls, cleanup leaked 0, lane stopped. `no-model 31` / `restore-model 31` round trip:
  settings identical apart from judge. Inline legend/level 4 not driven live (no replies on a no-model lane): stories only.
- Bundle: main `dist/index.js` 1,265,925 B (budget 1,300,000).
- `npm run gates:quick`: green after a max-len fix. `npm run gates` (no `--resume`, Storybook included) on the merged tree:
  all green in 457.6s (jest 10,827 passed / 1 skipped, test:debug 1,674, Storybook 169 suites / 1,025 tests, replay 32/32).
  An earlier run on the pre-merge tree was red on code-health (an `as unknown` cast and a silent catch in
  `compiledQualities.ts`, removed), a max-len, and one `CharacterTutorial` color-contrast play that passed on rerun.

## Phase 1 gate record

2026-10-30, branch `v3.0-29-ui-p1-kit` (kit `451e5377`, Studio-import guard and story max-len follow-ups; master merged in for 0b,
the controller and docs).

- Kit `src/components/ui/` (per-file imports, no barrel), CSS `src/styles/kit.css` (`so-*`, scoped to the mount roots), tokens extended
  in `src/styles/tokens.css` (space 4-24, radius sm/md/lg/pill, type xs 13px floor .. xl, `--so-control-h` 36px / 44px on coarse or <700px,
  `--so-icon-h`, `--so-dialog-w` 75rem, z panel/popover/dialog, `--so-dur` 0 under `prefers-reduced-motion` and `body.reduced-motion`):
  - Button (primary|secondary|ghost|danger, sm|md, icon, `busy`, `work` = BusyButton semantics via shared `useBusyWork`; BusyButton
    now uses the hook, look unchanged), IconButton (`label` required = aria-label + title), Switch (`button role=switch aria-checked`),
    SegmentedControl (radiogroup, roving arrows/Home/End), SettingRow (label, visible description wired to `aria-describedby`, control
    column, scope chip Default/Story/This chat/This device, reset IconButton only when `changed`, help tooltip/link; `data-so="setting-row"`),
    Section (title/description/actions; `collapsible` off by default and then a `<details>`, so Show-me reveal and `details.open` reads keep
    working), Tabs/TabList/Tab/TabPanel (underline|segmented, roving tabindex lifted from StudioModal into `rovingKeys.ts`), NavList
    (groups, counts, badges, `aria-current="page"`, `mobile="bar"` = one scrolling row under 700px), Card (interactive/selected/tone),
    Badge/Chip (tone always with an icon, neutral excepted), Callout (tone, title, actions), StatusDot (moved from `drawer/`, + info tone),
    Toolbar (start/end, sticky), EmptyState, Skeleton (`Lazy` default fallback; `quiet` Lazies keep null), Field (TextInput/Select/TextArea,
    `size` xs|sm|md|lg|full on `text_pole`), SearchField, Dialog/Sheet/DialogHeader (native `showModal`, ST blur on `--so-surface`,
    `full` = viewport + centred 1200px frame, `window` = centred card, `sheet` = right dock; full-screen/bottom under 700px; transform-only
    open animation on `--so-dur`; `body.no-blur` opaque).
  - 18 `Kit/*` stories with plays (button/busy, icon button, switch click/label/space, segmented arrows/End/wrap, setting row reset +
    describedby + scope chips, section toggle, tabs roving, nav aria-current, chips, callout, toolbar, empty, skeleton + Lazy fallback,
    field sizes, search clear, dialog close); Storybook theme toolbar `soTheme` (ST dark default, light palette, Celestial Macaron) in
    `.storybook/preview.ts` + `st-theme.css`; `Kit/` mounts in `#so-panels-root`.
- Adopted (cross-cutting only): one DialogHeader on the workspace (`size="full"`, h1 + scope subtitle, "Close Story Orchestrator"),
  Studio (`full`, title input + Badges in the slot, "Close studio"; the Studio frame stays full width for the graph), briefing (`window`,
  "Close the briefing", Start keeps focus) and PanelFrame (compact header as the drag bar, `data-so="panel-bar"`/`panel-close` kept,
  `dockInset` untouched). Old dialog chrome CSS removed from `styles.css`, `workspace.css`, `studio/mobile.css`; workspace control
  height is `--so-control-h` through `:where()`. `settings/Field.tsx`: `CheckRow` = SettingRow + Switch (ids kept; `kind="checkbox"`
  for the inline note categories), `Advanced` = collapsible Section (ids and `data-so="settings-advanced"` kept). Not migrated (area
  agents): drawer tabs, Studio nav, HUD, inline, page layouts, DevicePreferences rows, the Help inner header (0b `hosted`).
- Guards: `components/ui/kitAdoption.guard.test.ts` ratchets raw `menu_button`/`st-button` per file against
  `test/findings/rawButtons.json` (125 files, 396 uses; shrink it when migrating; planted controls); `architecture.test.ts` lets the
  Studio import `@components/ui/`; `rovingKeys.test.ts`.
- Harness: `scripts/debug/lib/settingToggle.mts` (role=switch clicked directly, checkbox through its label, read back) with
  `settingToggle.test.mts`; scenario `ui: {action: "setting-toggle", selector, on}` (schema + `so-scenario`), `so-ui.mts setting-toggle
  <sel> on|off`; debug-scripts.md updated. Stories reading `.checked`/`role=checkbox` on CheckRows moved to `toBeChecked`/`role=switch`.
- Visual: lane 35 (no-model, images/sprites/living/judge/extraction off, unchanged), worktree `dist/` routed into the lane browser
  (nothing staged), SO-UI cards + group + `factions.story.json` as `SO-UI Factions lab`: briefing, workspace (library, interface,
  connections), Help floating panel, Studio; desktop + 390x844, dark + light. Probes: workspace `data-size=full`, translucent bg +
  `blur(26px)`, frame 1200px, one header; briefing and Studio one header; switches 24px; briefing focus on Start; the Help panel still
  shows two closes in these shots (pre-0b build). Cleanup leaked 0, library 0, theme `Dark V 1.0` kept, 0 model calls; lane stopped.
  Storybook kit pages x 3 themes x desktop/mobile. All in `C:\dev\so-lanes\ui-review\p1-kit\` (drivers kept there as `.mts.txt`).
- Bundle: main `dist/index.js` 1,266,472 B (budget 1,300,000; +2,151 over 0a, merges included); kit CSS rides the lazy styles chunk.
- `npm run gates:quick`: green. Final code tree `82e1f1bc` (later merges docs only): `npm run gates -- --no-storybook` (no `--resume`)
  all green in 313.4s (build, typecheck, typecheck:test, test, debug:typecheck, lint, test:release, test:debug, test:replay, test:plugin).
  Storybook skipped in that run and run separately on the same tree, because port 6006 was taken by other worktrees' gates
  (EADDRINUSE twice): `npm run storybook:build` + `test-storybook --url http://127.0.0.1:6116`: 186 suites / 1,061 tests passed.
  Earlier full runs: one architecture red (Studio kit import, fixed), one max-len red (stories, fixed), one `PosesList`
  color-contrast play that passed on rerun, and three different process-timing flakes in untouched tests (`sessionsArchive`,
  controller startup reap, `childTree`) while the machine sat at 100% CPU.

## Phase 2 inchat gate record

2026-10-30, branch `v3.0-29-ui-p2-inchat` (IC3/IC4 `64c6b8c3`, IC8 `f69d3754`, IC1/2/5/6/7/9 `5f1b0b9c`, fixes `3a5978c0` `90a94082`;
master merged in twice, last at `ee9f75f7` with the harvest wave `435a614b`).

- IC1 HUD two zones: left the scene button (location icon, `sceneHeadline` from 0b, Author checkpoint span kept), tension as 5 dots
  + word (`[data-so=hud-tension]`, `--so-accent`); right `#so-hud-turn`, at most one status chip, pending, sheet button `#so-hud-sheet`.
  Font `calc(var(--mainFontSize) * 0.85)`; no ◈; kit tokens only.
- Harvest read-wait (37 S1/S2 folded): scheduler snapshot `yielding` (inner-beat yield gate, notified on both edges), `inFlightSince`
  stamped by `readWaitClock` in the scheduler wiring (re-publishes at `READ_WAIT_BOUND_MS` 120 s, unref'd timer). `derivePipelineStatus`
  names `waitingOn: "inner-beat"` ("waiting for a character" chip) only while the gate holds; a read in flight past the bound becomes
  `stalled-rechecking` + `retryable` (never cancels). Retryable/waiting chips open the story card; Try again = `retryExtraction`
  (scheduler `probe` → `pumpAll`, joins an in-flight read). Only the inner beat is observable today; judge/GPU queue/image not named.
- IC2/IC9 story card: anchored left above the scene button, 22rem, solid surface, kit IconButton close; status row with
  `#so-hud-card-retry` / `#so-hud-card-settings`; notices kept; one button per sheet page `[data-so=hud-card-tab][data-tab]` (aliases
  `#so-hud-card-journal|suggestions|memory`); plan 32 Skip ahead `#so-hud-card-skip` kept; Story window `#so-hud-card-more`; Author view
  only `#so-hud-card-level` (SegmentedControl, `setInlineSettings`). Memory peek moved into the sheet (`#so-hud-card-peek` gone).
- IC5/IC6/IC7 story sheet (decision 5): `#so-sheet` (lazy `components/sheet/StorySheet.tsx` inside `#so-panels-root`, state
  `presenceUi.tsx` `openSheet/closeSheet/toggleSheet`), tabs from `runtime/storySheet.ts` `sheetTabs` (journal, here, people, stats,
  `widget-<id>`, ideas, memory), panel `#so-sheet-<tab>`. Desktop dock right of `#sheld` (width 300–640, remembered as `sheet-dock`;
  overlay when the room is < 300), pop-out `[data-so=sheet-pop]` → `PanelFrame` `#so-panel-sheet` (new `actions` slot) and back.
  Under 768px a bottom sheet positioned by `top` above `#form_sheld` (fixed `bottom` breaks under ST's collapsed html containing block),
  snaps peek/half/full by grip drag or press, half = `min(40vh, area - min(lastReply, area/2))`, floor 120. Sheet and floating panels
  exclude each other on a phone. Wand: Story sheet, recap, briefing, flag, story window, Help (`#so-wand-help`);
  `#so-wand-journal|stat-sheet|suggestions` gone. `#so-open-*` launchers kept, each opens its tab.
- Shared tab bodies `components/sheet/tabs/*` (Play can embed them): JournalTab (no message ids, log rows jump via `[data-so=log-jump]`),
  HereNowTab (`sceneView`, "Nobody else is here."), PeopleTab (codex, `#so-journal-tab-people|places` kept), StatsTab (value-first
  `[data-so=sheet-value]`), WidgetTab, IdeasTab, MemoryTab (`memoryPeek`, `#so-sheet-memory-all`). Body CSS in `styles/sheet.css`
  scoped to `#so-panels-root, #so-workspace-modal, #drawer-manager`.
- Here now (35 S1): `composeGame` sets `scene` from an authored scene widget, else `sceneView` (time on, standing off — allegiance
  can be a surprise) for stories with codex people, labelled relationships or factions; portraits always passed. `hereNow.test.ts`
  (offering, 300 seeds 0 unrevealed secret labels). Plan 35 keeps only the story-time spans.
- IC3/IC4 inline (decision 6): one quiet line `[data-so=inline-line]` of parts `[data-so=inline-part][data-category]` (icon + word),
  expands to `[data-so=inline-group]` lists; Inspect text link at 3–4, raw counts at 4; `?` toggle gone, legend `#so-inline-legend`
  under `#so-inline-level` and in Help. 0.85x font, no opacity on text.
- IC8 Help: SearchField, flat list grouped by audience (`[data-so=help-group][data-audience]`), plain Where line, no `<details>`,
  inline legend section; guide nav column visible (`max-md:hidden` instead of ST's `.hidden`).
- Harness/fixtures: v28-04, v27-36, v28-23 (+followups, tab switching), v28-61b, v29-06 (3), v28-65 (+scene-lines) moved to
  `#so-sheet`/`#so-sheet-ideas`/`#so-here-now`; frozen v2.9 06-lt corpus left untouched (hash-pinned); `so-ui.mts` inline reader.
  Privacy reviews render `components/sheet/sheetMarkup.ts` (journal + both people pages + Here now).
- Docs: story-guide (in-chat surfaces, Scene card default), `docs:guide`, `docs:settings`, CLAUDE.md UI entry points.
- Live: lane 32 (no-model; living + extraction switched off on the lane copy, images/sprites/judge off, read back), worktree `dist/`
  routed into the lane browser (nothing staged), SO-UI cards + group + `factions.story.json` as `SO-UI In-chat lab` (+ public `coins`),
  desktop 1920x1080 + 390x844, dark + light: HUD font 12.75px, no ◈, card left 427 vs scene 438, sheet docked 380px right of chat,
  no message ids, tabs journal/here/stats/ideas/memory, popped window and back, author level pick → 3, wand 5 entries, Help panel,
  `assertPlayerClean` ok on both viewports; cleanup leaked 0, library 0, 0 remote model calls (10 local completions blocked), lane
  stopped. On this lane's short chat column the phone half snap falls to its 120px floor and covers the last reply (cap works, the
  room does not). `C:\dev\so-lanes\ui-review\p2-inchat\` (driver kept as `.mts.txt`).
- Bundle: main `dist/index.js` 1,289,766 B (budget 1,300,000; +6,147 over master 1,283,619: sheet state, `storySheet.ts`, sheet copy,
  HUD meter in main; bodies, sheet, card, Help lazy).
- `npm run gates:quick` green during the work. Full `npm run gates` (no `--resume`, Storybook on its own port): first run red on code
  health (scheduler over its file budget, a dead export), a frozen-corpus hash and three Storybook plays (duplicate label, landmark);
  fixed, then all green in 1000.5s (jest 10,854 passed / 1 skipped, Storybook 191 suites / 1,095 tests). After merging the harvest wave:
  red on two load flakes (`patterns.test.ts` p95, `startupWiring` timer) that pass alone; rerun on the same tree `ee9f75f7` (no `--resume`) all green in 1010.5s (jest 10,980 passed / 1 skipped, Storybook 191 suites / 1,098 tests, test:debug, replay, release, plugin, lint, typechecks).
- Not done / owner: wand's "Illustrate story scene" still shows greyed when images are off (lives in `stHost/imageSurface.ts`, image
  module); GPU-queue/judge/image waits not named (not observable yet); stats "changed N replies ago" stays a visible muted line.
