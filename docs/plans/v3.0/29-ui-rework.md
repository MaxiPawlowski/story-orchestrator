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
