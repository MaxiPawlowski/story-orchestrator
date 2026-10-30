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

## Phase 2 author gate record

2026-10-30, branch `v3.0-29-ui-p2-author` (WP-A4 `e32331dc`, WP-A3 `f454da27`, WP-A2 `7f9f8b3f`, fixes, master merged in up to `435a614b`).

- WP-A2 run console (`components/drawer/DrawerTabs.tsx`, `runtime/authorConsole.ts`): `#drawer-manager` kept; sticky Steer column
  `[data-so="steer"]` (DriverPanel on the kit: checkpoint name + id, boundary, pipeline in words, readable unmet gates from
  `runtime/gateReadout.ts` "Guide's trust ≥ 2, now 0 → The confession", Suggest/Probe/Report, Advance, Nudge, `#so-author-story-controls`;
  Suggest/Report/Nudge only with the wizard on; mobile = collapsible bar). Sections are kit `Tabs` (`role=tab`, body `data-so-tab`):
  health (`#so-author-overview`, requirements, setup checks in one line + Open setup, history floor), state, memory, prompt, proposals
  (count badge), activity (`#so-open-activity` on the tab), pipeline. Review page renders the console on Proposals. Install toggles left the
  Memory section (link to settings). `DRAWER_TAB_OF_CONTROL` → state/proposals; NextTurn owners state/proposals; `so-ui.mts drawer-tab` aliases
  Overview/Blackboard/Payload/Scheduler/Review (unit test); scenarios moved to the new labels.
- WP-A3: `blackboardView.stateTable` grouped (Gates/Authored/Character life/Clock/Factions/Compiled), search, group chips, changed-at from the
  boundary log (`boundaryDigest.lastChanges`), fresh-row highlight, evidence popover; ActivityPanel filter chips, `#N` links, one setup line.
- WP-A4: inspector `#so-inspector` is the floating panel `inspector` in `#so-panels-root` (default right of the chat): header with ‹ ›
  (`stepMessage`), What changed / Why (`boundaryDigests` on `InlineView.boundaries`, Author view only), Prompt (`InlineView.prompts`), Health,
  notes; raw items only at level 4; Open in Author page. `#so-inspector-close` dropped (PanelFrame close), `inspectorIntent`/`INSPECTOR_CONTROL`
  removed. Author chips at level ≥ 3 carry labels and a ~1.4em hit area; Inspect is labelled.
- Harvest: who-knows-what grid `#so-who-knows` (memory section) + kept-out-on-stage alert (Steer and grid), built from `heldSecrets` through
  `secretAudience` (same `allowed` rule as `keptFrom`), inputs from `MemoryInjector.secretGridInputs()` only in Author view, grid built in the
  lazy `authorConsole` chunk; `assert-player-clean` ok (0 findings) with a held secret.
- Selector changes: tab labels/`data-so-tab` values (aliases in `drawer-tab`), `#so-inspector` parent, `#so-inspector-close` gone; kept
  `#so-author-overview`, `#so-author-story-controls`, `#so-edit-story`, `#so-update-story`, `#so-author-new-story`, `#so-history-floor`,
  `#so-branch-from-oldest`, `#so-fix-with-wizard`, `#so-author-moves`, `#so-open-activity`, row `data-so` hooks.
- Raw buttons ratchet shrunk (DrawerTabs, DriverPanel, MessageInspector, ActivityPanel to 0; AuthorMemory, Workspace down).
- Visual: lane 33 (no-model; images/sprites/living/judge/extraction switched off in the lane settings, backup in
  `C:\dev\so-lanes\ui-review\lane33-settings.pre-p2-author.json`), worktree `dist/` routed into the lane browser, SO-UI Guide/Narrator + group,
  `character-life` as `SO-UI Life lab`, three `/sendas` boundaries, one seeded hiding secret: desktop + 390x844, dark + light, 0 model calls,
  cleanup leaked 0 / library 0, inline level restored, lane stopped. One earlier run leaked its group after a reload timeout; removed with
  `so-assets remove --marker SO-UI`. `C:\dev\so-lanes\ui-review\p2-author\` (driver kept as `.mts.txt`).
- Bundle: main `dist/index.js` 1,284,350 B (budget 1,300,000; +733 over master 435a614b).
- `npm run gates` (no `--resume`, Storybook included) on `597a60a2`: all green in 685.8s (jest 10,977 / 1 skipped, test:debug 1,722,
  Storybook 187 suites / 1,077 tests, replay 32/32). An earlier full run was red on code-health (snapshotBuilder file budget, two dead
  exports), five DrawerTabs plays (story snapshot without `inline`), and two known flakes (HelpPanel Ask timeout, controller startup reap).
- Not done: Review nav item count badge (WorkspaceShell belongs to the Settings agent; the Proposals tab carries the count); inspect chip on
  messages that have no notes (step with ‹ › instead).
