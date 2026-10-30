# UI review v3.0 plan 29: in-chat area (phase 1)

Scope: everything in or beside the chat column. HUD `#so-hud`, story card `#so-hud-card`, inline timeline under messages,
floating panels `#so-panels-root`, mobile docking, the wand menu entries, story badges, author chips.

Method, 2026-10-30: lane 32 (no-model, `image.enabled`/`sprites.enabled` read back false before import), ST dark theme as
seeded. A copy of `test/fixtures/factions.story.json` (roster renamed to `SO-UI-*`, one public `coins` quality added), group
`SO-UI-Guild` of four generic cards, persona display name set to a neutral one. Turns made with `/send compact` + `/sendas`,
state with `/cp set` (tension 0.7, coins 12), one mocked read (`runExtractionNow(<DELTA lines>)`) to fire one transition so a
progress chip exists. UI-only use of a mock, not a gate. Desktop 1920x1080 and 390x844. All test assets removed afterwards
(`/delchat`, `so-library remove`, `so-assets remove --marker SO-UI`, 0 left), inline level and Author view put back, lane stopped.

Remote calls: none from this lane during the run. The lane's `server.log` since this run's start (line 42808) has no
`story-orchestrator-harness`, judge or TypeSafe line. The only model traffic is text-completion requests to the lane's offline
backend and 8 local `DeepSeek API key is missing` refusals. Older harness lines in the same log come from earlier lane runs.
The coordinator's warning (living/critic on opencode at import) came after my import. I did not see that here, but this lane
had living, curator, judge and extraction at their defaults. The lane is stopped now, so nothing is left running.

Screenshots: `C:\dev\so-lanes\ui-review\inchat\` (`d*` desktop, `m*` mobile, `n*` native ST for comparison). The native
World Info drawer shot was deleted because it can show campaign book names.

Caveat: with no model, the pipeline stays at "catching up…" and memory and reads are empty. Chips, memory peek and
suggestions were checked as empty states, plus one progress chip and the author levels.

## 1. Inventory

| Surface | Selector / file | Reached from chat | Holds |
|---|---|---|---|
| HUD strip | `#so-hud` `drawer/HudStrip.tsx`, mounted in `#so-hud-root` above `#form_sheld` (`index.tsx:416`) | always visible | scene line `#so-hud-main` (◈ + "now" line), `tension <level>`, `#so-hud-turn` "Your move.", one of `#so-hud-pipeline` / `#so-hud-setup`, `.so-hud-pending`, branch chip `#so-hud-branch`, `MediaPending` |
| Story card | `#so-hud-card` `drawer/HudCard.tsx` (lazy) | 1 click on scene | title, now line, pipeline status + action, notices (≤3), launchers journal / suggestions, memory peek toggle `#so-hud-card-memory` (inline disclosure), More… → workspace Play |
| Inline timeline | `#so-inline-<mesid>` (`stHost/inlineMount.ts`, the only `.mes_block` writer), `components/inline/*`, `inline.css` | under messages | category chips (8 categories, icon + count), one expanded panel per message, legend `?` on the newest strip, `#so-inspector` magnifier at level ≥3, `ChapterCard`, `RollChips` |
| Inline level | `#so-inline-level` (workspace Orchestrator → Interface) | 4 clicks | 0 Off / 1 Story / 2 Behind the scenes / 3 Author / 4 Raw |
| Floating panels | `#so-panels-root` `panels/PanelsHost.tsx`, `PanelFrame.tsx`, `runtime/panelGeometry.ts` | wand, story card, workspace "Beside the chat" | Help and Ask, Guide, Journal, Stat sheet, story widgets, What could I do?; drag/resize/keyboard move; geometry saved per id |
| Mobile dock | `.so-panel--docked` (<768px) | same | last opened panel only, `min(55dvh, …)` tall, bottom sheet above `#form_sheld` |
| Wand menu entries | `#so-wand-*` (`presenceUi.tsx` `mountMarks`) | 1 click on ST's wand | recap popup, briefing, flag, suggestions, journal, story window, stat sheet (and "Illustrate story scene", greyed out with images off) |
| Story badges | `.so-story-badge` (`stHost/charListBadges.ts`) | character list | route / saga icon on groups with a story |
| Author chip / inspector | `[data-so=inline-inspect]` | level ≥3, Author view | opens the Author page with `#so-inspector` |
| VN sprite stage | none rendered with images and sprites off | n/a | nothing to review in this state |

Disclosures in this area: the story card's memory peek (1). Inline: 1 expanded panel per message plus the legend (2 per
strip). Help panel: **73 `<details>`** (one "Where:" per feature row), none nested. Guide panel: no disclosures, but an empty
left column. The rest of the in-chat area is popovers and panels, not accordions. The noise here comes from having many
launchers and floating windows, not from nesting.

Clicks from the chat for the common tasks (today):

| Task | Clicks | Path |
|---|---|---|
| Where am I / how tense | 0 | HUD, but it reads "Current scene" unless the checkpoint has a `player_title` |
| Open story card | 1 | HUD |
| Journal | 2 | HUD → card → Open the journal, or wand → Journal |
| Stat sheet | 2 | wand → Stat sheet only (not on the card); 3 via top bar → Play → launcher |
| What could I do? | 2 | card or wand |
| Memory peek / full memory | 2 / 3 | card → peek → "All" |
| What a chip means | 1–2 | chip, or `?` on the newest strip only |
| Change inline level | 4 | top bar → Orchestrator → Interface → select |
| Flag a moment / recap | 2 | wand |
| Help and Ask | 4 | top bar → Orchestrator → Help → Help and Ask |
| Retry a stalled pipeline | 2 | HUD chip → workspace Play → Try again |

## 2. Findings (ranked)

### S1: breaks or misleads

**F1. The HUD's main line says nothing.** `#so-hud-main .so-hud-name` shows "◈ Current scene" whenever the checkpoint lacks
`player_title` (`pipeline.ts:55` `fallbackScene`, `narrative.ts:214`). That is most stories, and in Author view too.
Evidence: `d02-chat-level1.png`, `d04-hud-closeup.png`, `d10-hud-author.png`; the card title repeats it (`d05b`). The
most prominent line of the HUD is a placeholder. It hurts glanceability and wastes the one always-visible line.
Fix: player gets the story title (or the chapter) when no `player_title` exists. Author view adds the checkpoint name and
id (author adds, never reveals to the player).

**F2. On mobile, a docked panel hides the chat completely.** A docked panel is `min(55dvh, …)` tall (`styles.css` `.so-panel--docked`).
At 390x844 the journal is 464 px and covers the whole visible chat (`m04-journal-docked.png`, `m06`). You cannot read the
reply you are reacting to. That breaks the in-chat rule ("needs the chat visible"). Opening a second panel hides the first
but leaves it open; widen the window and both come back stacked (`n02`, journal resurrected; `panelGeometry.ts`
`shownPanels`).

**F3. The story card covers the chat it summarises, and its disclosure scrolls out of sight.** The card is
`position:absolute` over `#chat`, centred (`left:0; right:0; margin:auto`), so it is not anchored to the scene button at
the left of the HUD (`d05-hud-card-open.png`). Chat text shows through at its top edge. On mobile `max-height` is the room
above the HUD (231 px, `HudCard.tsx` `cardRoom`). Pressing "What the story remembers" opens the peek *below* the fold
inside the scroll box, so nothing visibly changes (`m03-hud-card-memory-peek.png`).

**F4. The inline legend breaks the layout.** `InlineLegend` renders *inside* `.so-inline-chips` (flex-wrap,
`align-items:center`, `InlineStrip.tsx`). Opening it pushes the chips to the vertical middle of a tall legend block and
drops the open category panel out of view (`d08-inline-legend.png`). The legend appears only on the newest strip, so to
find out what a chip means you have to scroll to the last message.

### S2: hurts every turn

**F5. Inline chips are icon-only and too faint to read.** Chips are 12px icons at `opacity:0.7` on a 12% tint with no label
(`inline.css` `.so-inline-chip`). The expanded text is 0.8× font in `--SmartThemeEmColor` (`d06`, `d07`). Player level 1
gives "✓ The story moved on" behind two clicks (route icon + `?`). That is almost no information for the space it takes on
every message (`d03b-chat-column.png`). At level 3–4 user messages get chips too, and level 4 dumps raw JSON blackboards
inline (`d09-inline-level4-author.png`). An open category stays open across level changes.

**F6. Too many launchers, each worded differently.** The journal opens from the story card ("Open the journal"), the wand
("Journal") and workspace "Beside the chat" ("Open the journal"). The stat sheet opens from the wand ("Stat sheet") and
workspace ("Open the stat sheet") but not from the card. Help and Ask is 4 clicks away and not in the wand at all.
Copy lives in `gameCopy.ts:6-7,23-24`, `presenceCopy.ts:24`, `presenceUi.tsx` `LAUNCHERS` + wand list. The wand order
puts "Stat sheet" after "Open the story window" (`d11-wand-menu.png`, `m05`), and shows a disabled "Illustrate story
scene" with images off.

**F7. Panels open in fixed spots, away from the chat.** Defaults are hard-coded top-left (`panelGeometry.ts`
`PANEL_DEFAULTS`: help 80,80; journal 140,90; stat sheet 180,120; suggestions falls back to 80,80). Three panels stack
over the background, far from the chat column (`d12-after-so-wand-suggestions.png`). The guide (780x620) overlaps the top
of the chat (`d17`). Panels have a fixed height, with large empty bodies (`d13` stat sheet 420 px for one row, `d14`).

**F8. Help panel has two headers and two close buttons.** `PanelFrame` draws "Help ✕" and `HelpHost`/`HelpPanel` draws its
own "Help ✕" (`d16-help-panel.png`). Its "Where:" breadcrumb names a page that no longer exists: "Orchestrator › Playing ›
Story for this chat" (`features/registry.ts:110,117`; the workspace Orchestrator pages are Library / Defaults /
Connections / Interface / Help). The 73 per-feature `<details>` make it a long scroll in a 420 px window.

**F9. The journal and stat sheet show internals and get the hierarchy backwards.** Log rows start with raw message ids
"#13", "#11" (`widgets/WidgetCard.tsx:106` `#{row.at.messageId}`) and repeat only the player's own lines (`d14`). On the
stat sheet the value is small and muted while the label is large (`StatSheetPanel` → `WidgetCard`
`st-muted text-xs` on the value, `d13`). The number the player wants is the least visible thing.

### S3: consistency and polish

**F10. The HUD type is small and fixed.** `#so-hud` is `font-size:12px` hard-coded against ST's `--mainFontSize` 15px. Its
chips are pills in `--st-info`, while the inline chips are 4px-radius squares and the card buttons are 44px `menu_button`s.
That is three chip styles in one column (`d04`, `d06`, `d05b`).

**F11. The card's close button is a tall narrow pill.** It gets `min-height:44px` on an icon-only `menu_button`
(`styles.css` `#so-hud-root .so-hud-card-head .menu_button`, `d05b`). The panel close buttons are small squares. The two
should match.

**F12. Card actions wrap unevenly.** Four buttons wrap 2+2 with different widths, and "More…" has no icon (`d05b`, `m02`).

**F13. The pipeline chip tells the player one thing and does another.** "catching up…" appears while the memory model
is down. Clicking it opens the whole workspace instead of retrying in place (`HudStrip.tsx` onClick → `onOpenStory`).
The card already holds the status line, so retry could live there.

**F14. The ◈ glyph is a text character**, not an FA icon like the rest of ST's chrome. It is easy to read as decoration.

**F15. `HudCard` has no `.stories.tsx` of its own.** It is covered only through `HudStrip.stories.tsx`. That is allowed,
but a rework should add one.

What already fits ST well: panels and card use `--SmartThemeBlurTintColor` + blur, `Noto Sans`, a black border and an
8px radius. That is the same family as ST's native popup (`n04-native-popup.png`) and drawers. The wand entries look
native (`d11`). Badges are subtle and fine. The visual base is sound. The problems are where things sit, what they say,
and how they compete for space.

## 3. Proposal

Principles: one in-chat entry point (the HUD), one place for side content (a single "story sheet"), glanceable lines that
carry real information, chips with words, mobile as a bottom sheet that leaves the last reply readable.

### 3.1 HUD: a two-zone status bar

- Left: scene button. Player: `player_title` → chapter title → story title (never "Current scene"). Author view adds the
  checkpoint name in a muted second span. Tension becomes a 5-step dot meter plus the word, using `--SmartThemeQuoteColor`.
- Right: at most one status chip (your move > needs setup > catching up), then one **Story sheet** icon button
  (`#so-hud-sheet`, FA `fa-book-open`) that opens the sheet (3.3).
- Font: `calc(var(--mainFontSize) * 0.85)`, so it follows ST's scale like the inline host does. FA icons, no ◈.
- The status chip acts in place: "catching up…" → popover "Memory model not answering · Try again · Settings". Setup →
  workspace Repair as today.

### 3.2 Story card: an anchored popover above the scene button

- Anchored to the left edge of `#so-hud-main` (desktop width 22rem). Solid `--SmartThemeBlurTintColor` without
  see-through.
- Content: title, now line, status line with an inline Try again, notices, then a row of **tabs-as-buttons** that open
  the sheet on that tab (Journal · Stats · Ideas · Memory). "More…" becomes "Story window ↗".
- The memory peek moves into the sheet's Memory tab. The card loses its disclosure.
- Close button: a 28px square `menu_button` like the panels.

### 3.3 One "Story sheet" instead of N floating panels

Replace the per-panel windows (journal, stat sheet, widgets, suggestions, memory peek) with **one** lazy surface,
`#so-sheet`, that has tabs. Help/Guide stay separate panels, because they are reference reading, not play state.

- Desktop: a right-side dock beside the chat column (`position:fixed`, from the right edge of `#sheld` to the viewport
  edge, or overlaying ST's right drawer zone when the window is narrower than chat + 360px). Resizable width, remembered.
  It can still be popped out as a floating `PanelFrame` (keeps today's drag code and `panelStore`).
- Mobile: a bottom sheet with three snap points: peek (tab bar + 1 line, ~120px), half (40dvh), full. The default is
  **half, capped so the last message stays visible**: `min(40dvh, viewport - formTop - lastMesHeight)`. Swipe or drag the
  grip to change it. Tabs scroll horizontally.
- Tabs come from what the story has (`chatPanelsShown`): Journal (quests + log without message ids, each row jumps to its
  message), Stats (value right-aligned, prominent; label muted; "changed 2 replies ago" as a tooltip/secondary), story
  widgets (one tab each, or "Board"), Ideas (What could I do?), Memory (peek + "Open memory" → workspace).
- Every launcher (wand, card, workspace "Beside the chat") calls `openSheet(tab)`. Wand entries collapse to "Story sheet",
  "Story recap", "Flag this moment", "Story window", "Help". The disabled illustrate entry is hidden when images are off.

### 3.4 Inline timeline: one quiet line, words on demand

- Level 1 (player): a single muted text line under a message, only when something happened. Example: "↳ The story moved
  on · Remembered 2 things". Category icons are kept, but each sits with its word. No `?` button: the line explains itself,
  and a tooltip names the category.
- Clicking the line expands a compact list under it (one at a time per message, as today).
- Level 2 adds pacing and cast words. Levels 3–4 (Author view) use the same line plus an "Inspect" text link. Level 4
  raw JSON moves into the inspector, never inline, so the level-4 inline view equals level 3 plus raw counts.
- The legend moves into Help (and the Interface page next to `#so-inline-level`). The newest-strip `?` is deleted.
- The level picker is also offered in the story card for authors (Author view only), so changing it takes 2 clicks.
- Contrast: text at `--SmartThemeEmColor`, minimum 0.85× font, no opacity on top of it.

### 3.5 Help panel

- One header (PanelFrame's). `HelpPanel` drops its inner title/close when hosted in a panel (`hosted` prop).
- Feature list: search on top, then a flat list grouped by audience, with "Where" as a plain line, not 73 `<details>`.
  Breadcrumbs come from `workspaceRoutes.ts` so they cannot go stale (fixes "Playing ›").
- Guide panel: fill or remove the empty left column (TOC or nothing).

### 3.6 Wireframes

Desktop chat column (1920 wide, chat 1056 px, sheet docked right):

```
 ┌──────────────── chat column (#sheld) ───────────────┐┌── Story sheet #so-sheet ──┐
 │ SO-UI-Sera                                           ││ Journal  Stats  Ideas  Mem│
 │ Sera holds the door. "Walk with me..."               ││───────────────────────────│
 │ ↳ The story moved on · Remembered 2 things           ││ Quests                    │
 │                                                      ││  The clerk's debt  Active │
 │            I follow her out into the rain.           ││ Log                       │
 │ SO-UI-Narrator                                       ││  You: I follow her out…  ↗│
 │ The street glistens under the lamps...               ││  You: I bow to the envoy ↗│
 ├──────────────────────────────────────────────────────┤│                           │
 │ ◆ The street  ●●●●○ critical        [catching up ⟳] 📖││                           │
 ├──────────────────────────────────────────────────────┤└───────────────────────────┘
 │ ☰ ✨  Type a message…                               ➤ │
 └──────────────────────────────────────────────────────┘
```

Story card (anchored at the left of the HUD):

```
 ┌ The street ─────────────────────── ✕ ┐
 │ Things are close to breaking.         │
 │ Memory model not answering. [Try again]│
 │ New: The guild noticed you.           │
 │ [📖 Journal] [≡ Stats] [💡 Ideas] [🧠 Memory]│
 │ Story window ↗        (author: Level ▾)│
 └───────────────────────────────────────┘
 ◆ The street ●●●●○ critical      [catching up ⟳] 📖
```

Mobile 390x844, sheet at half height, last reply still visible:

```
 ┌──────────── 390 ────────────┐
 │ (top bar)                   │
 │ SO-UI-Narrator              │
 │ The street glistens under   │
 │ the lamps. The carriage…    │
 │ ↳ The story moved on        │
 ├─────────── ═══ ─────────────┤  ← grip, drag to peek/full
 │ Journal  Stats  Ideas  Mem ›│
 │ The clerk's debt     Active │
 │ You: I follow her out…    ↗ │
 ├─────────────────────────────┤
 │ ◆ The street ●●●●○  ⟳  📖   │
 │ ☰ ✨ Type a message…       ➤│
 └─────────────────────────────┘
```

### 3.7 Product rules kept

- Player/author: Author view adds the checkpoint name, the level picker in the card, the Inspect link and raw counts.
  Nothing on the player surface is conditionally revealed (`so-ui.mts assert-player-clean` stays the gate).
- In chat vs workspace: the sheet holds glance and act-mid-turn content only. Configure, library, repair and author pages
  stay in the workspace.
- `#so-hud`, the card and the inline host stay in main (small). The sheet, its tabs, Help and Guide are lazy chunks, as
  `PanelsHost` is now. No budget raise expected (the net is a deletion of the separate journal/stat/suggestion frames).
- CSS stays scoped: add `#so-sheet-root` to the `:is(...)` scope list and to `.storybook/preview.ts` `mountRootFor`. A
  native `<dialog>` is not used for the sheet (it is non-modal, like today's panels).
- Stories: `HudStrip`, new `HudCard.stories.tsx`, `StorySheet.stories.tsx` (desktop dock, mobile snap points),
  `InlineLine.stories.tsx`.

### 3.8 Selectors that change (harness must follow)

| Today | After | Users |
|---|---|---|
| `#so-panel-journal`, `#so-panel-stat-sheet`, `#so-panel-suggestions`, `#so-panel-widget-*` | `#so-sheet` + `[data-so=sheet-tab][data-tab=journal\|stats\|ideas\|memory\|widget-*]` | `test/scenarios/v28-04-presence-panels.json`, `v27-d-06-presence.json`, `v29-06-anchored-suggestions.json`, `v28-61b-suggest-edit.json`, `v27-36-quests.json`, `so-ui.mts`, `so-ui.test.mts`, `so-responsive.mts` |
| `#so-hud-card-journal`, `#so-hud-card-suggestions`, `#so-hud-card-memory`, `#so-hud-card-peek`, `#so-hud-card-memory-all` | `[data-so=hud-card-tab][data-tab=…]` (keep ids as aliases one plan) | `v28-65-scene-card.json`, `v29-08-observations.json` |
| `#so-open-journal`, `#so-open-stat-sheet`, `#so-open-widgets`, `#so-open-suggestions` | kept, each opens the sheet on its tab | workspace Play scenarios |
| `#so-wand-journal`, `#so-wand-stat-sheet`, `#so-wand-suggestions` | `#so-wand-sheet` (+ `#so-wand-help` new) | `so-tour-check.mts`, presence scenarios |
| `[data-so=inline-chip]`, `[data-so=inline-legend-toggle]`, `[data-so=inline-legend]` | `[data-so=inline-line]`, `[data-so=inline-part][data-category]`; legend removed | `so-ui.mts inline`, `so-ui.test.mts`, `player-clean-t1-2-1.json`, `sessionLive.test.mts` |
| `[data-so=inline-strip]`, `[data-so=inline-expanded]`, `[data-so=inline-item]`, `[data-so=inline-inspect]` | kept | same |
| `#so-hud-main`, `#so-hud-pipeline`, `#so-hud-setup`, `#so-hud-turn`, `#so-hud-card` | kept; new `#so-hud-sheet` | many |

## 4. Work packages

| WP | What | Size | Depends | Risk | Touches |
|---|---|---|---|---|---|
| IC1 | HUD line: scene fallback chain (player_title → chapter → story title), Author checkpoint span, tension meter, font follows `--mainFontSize`, FA icon | S | none | low; `narrative.ts`/`pipeline.ts` copy tests, `assert-player-clean` | `HudStrip.tsx`, `pipeline.ts`, `narrative.ts`, `HudStrip.stories.tsx`, `styles.css` |
| IC2 | Story card anchored left, solid bg, 28px close, actions row, inline Try again; add `HudCard.stories.tsx` | S | IC1 | low | `HudCard.tsx`, `styles.css`, `v28-65-scene-card.json` |
| IC3 | Inline: legend out of the chip row (fixes F4 alone), contrast floor, level 4 raw JSON → inspector only | S | none | low | `InlineStrip.tsx`, `InlineLegend.tsx`, `inline.css`, `InlineDetail.tsx`, stories |
| IC4 | Inline "one quiet line" rendering for levels 1–2, words with icons, remove `?` | M | IC3 | medium: harness selectors, player-clean fixture | `components/inline/*`, `runtime/inlineTimeline.ts` (labels), `so-ui.mts inline`, `so-ui.test.mts`, scenario fixtures |
| IC5 | Story sheet: one tabbed lazy surface; desktop right dock + pop-out; journal/stats/widgets/ideas/memory as tabs; journal without message ids, stats value-first | L | IC2 | medium-high: replaces 4 panel ids, geometry store migration (none needed: drop old keys) | `panels/*`, new `sheet/*`, `presenceUi.tsx`, `chatPanels.ts`, `panelGeometry.ts`, `WidgetCard.tsx`, presence scenarios, `so-responsive.mts` |
| IC6 | Mobile bottom sheet with snap points; cap keeps the last message visible; one sheet means no hidden-but-open panels | M | IC5 | medium: touch drag, ST `translateZ(0)` containing block | `PanelFrame.tsx`/sheet, `panelGeometry.ts` `dockInset`, `styles.css`, mobile stories, `so-responsive.mts` |
| IC7 | Launcher consolidation: wand list trimmed + Help entry, card tabs, workspace "Beside the chat" all call `openSheet(tab)`; one copy set | S | IC5 | low | `presenceUi.tsx`, `gameCopy.ts`, `presenceCopy.ts`, `so-tour-check.mts` |
| IC8 | Help panel: single header (`hosted`), flat searchable list, breadcrumbs from `workspaceRoutes.ts`; guide empty column | M | none | low; `helpShowMeAudit` must still reach every row | `components/help/*`, `features/registry.ts`, `guide/GuideHost`, `so-ui.mts help-showme-audit` |
| IC9 | Author level picker in the story card (Author view only) | S | IC2 | low | `HudCard.tsx`, `settingsControl` |

Suggested order: IC3, IC1, IC2 and IC8 can run in parallel (small, independent), then IC5 → IC6 → IC7, with IC4 and IC9
last. Each WP closes with `npm run gates`, plus a live lane check at 1920x1080 and 390x844 (`ST_DEBUG_VIEWPORT`) and
`so-ui.mts assert-player-clean`.

## 5. Open questions for the owner

1. Desktop sheet: docked to the right of the chat (always visible while open) or floating like today's panels?
2. Inline at player level: a single words-line ("↳ The story moved on · Remembered 2 things"), or keep icon chips but
   labelled?
3. With no `player_title`, should the HUD show the story title, the chapter title, or nothing (hide the scene line)?
4. Should the stat sheet and widgets live in the same sheet as the journal (tabs), or stay as separate pop-outs?
5. Should the wand menu keep story entries at all once the HUD has a sheet button (fewer entry points), or stay as a
   second door?
