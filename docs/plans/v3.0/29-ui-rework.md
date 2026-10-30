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
