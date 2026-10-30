# UI review v3.0 plan 29: player area (phase 1)

Area: the player-facing story window outside the chat column. Workspace Story → Play, Story → Review (player view), start
pane `#so-briefing`, setup/repair rows, no-chat/no-group states, player chapters/promises/codex/widgets surfaces and their
launchers. Reviewed 2026-10-30 on lane 31 (no-model, offline seed, images and sprites off, judge off), ST dark theme as
installed, build `cfec6b7e` staged.

Fixture: a scratch story `SO-UI Player Review` (player profile, two-section briefing, two chapters, one side quest, one
codex place, clue + clock widgets, two public stats) in a new chat of the generic test group (Arin, DM Narrator). State
built with `send-compact`, `/sendas` and `/cp set` (no model). Cleaned up after: chat deleted, story removed from the
library, `so-assets list --marker SO-UI` empty, no mirror book was created, lane stopped.

Screenshots: `C:\dev\so-lanes\ui-review\player\` (`d*` = 1920x1080, `m*` = 390x844). `d01`/`d03` show ST's own
drawers for comparison.

`so-ui.mts assert-player-clean` on the played chat: **ok: true, 0 findings, 0 sweep hits** (11 surfaces, 12 selector
surfaces walked). No author leakage. The problems below are about clarity and quality, not spoilers.

## 1. Inventory

| Surface | Reach (from chat) | Holds | Disclosures |
|---|---|---|---|
| Top-bar launcher `#so-drawer .drawer-toggle` | 0 (icon, no label) | opens workspace on Story → Play | — |
| HUD `#so-hud` | always visible above input | scene name, `catching up…` chip | — |
| Story card `#so-hud-card` (`HudCard.tsx`) | 1 (`#so-hud-main`) | scene, status sentence, Open the journal, What could I do?, What the story remembers, More… | — |
| Start pane `#so-briefing` (`BriefingModal.tsx`, `PlayerSetupPane.tsx`) | auto on first open; Play → Story briefing (2 + scroll) | title, identity pane (role, summary, assumes, keep / pick / create persona, persona note), briefing sections, onboarding, opt-out, start button | `Create a persona…` `<details>`, onboarding `<details>` |
| Play `.so-play` (`Workspace.tsx` L60-87) | 1 | h2, BranchNotice, Setup, task card (PlayerOverview + YourCharacter + LivingSave), Beside the chat, Illustrations, memory, action row | Your character, Chat image preferences, What the story remembers (+ dismissed setup, + one per chapter record) |
| Setup `#so-setup` (`SetupSection.tsx`) | top of Play; HUD setup chip | severity label, consequence, Show me / fix / I know, keep it; dismissed list | dismissed `<details>` |
| PlayerOverview `#so-player-overview` | inside Play | Where you are, About, Recently, consequences, Open threads, Quests, The End, Your story (chapters), This chapter/story so far, Noted, promises, carry card, rollback notices, requirements, pipeline line + Try again | chapters: one `<details>` each |
| Your character `#so-your-character` | Play → expand (2) | 4-5 sentences + locked hint | itself a `<details>` |
| Beside the chat `#so-chat-side` (`presenceUi.tsx` L65) | Play | 4 launchers that close the workspace and open a floating panel | — |
| Illustrations `#so-image-chat` (`image/ImageChatPanel.tsx`) | Play | install note, pause toggle, preferences (model, quality, direction), Illustrate scene / Portrait / Background, queue | `Chat image preferences` |
| Memory `#so-open-memory` (`tabs/MemoryTab.tsx`) | Play → expand (2) | duplicate heading, Memorize chat, filters, tier groups, Pin/Edit/Exclude per row | itself a `<details>` |
| Action row | Play bottom | Restart story, Story briefing, ⚑ flag | — |
| Review (player view) | 1 | wall: "can reveal private knowledge…", Show author view | — |
| Author (player view) | 1 | same wall | — |
| Features | 1 | other reviewer's area | — |
| No chat / no story / solo chat | 1 | "Choose a story for this chat." + Open library | — |
| Journal panel (`panels/JournalPanel.tsx`, `CodexPage.tsx`) | 2 (HUD card or Play launcher) | Journal / People / Places tabs, quests, main line, log | — |
| Stat sheet / story panels / What could I do? (`StatSheetPanel`, `WidgetPanel`, `SuggestionsPanel`) | 2 | public stats, widgets, suggestions | — |

Counts (Play page, played state, `d11`): 3 `<details>` always (+1 dismissed setup, +N chapter records), nesting depth 1,
18 buttons, 4 inputs, ~270 words when expanded, ~190 collapsed; 1356 px tall at 1080 (scroll needed). Start pane: 2
disclosures, 6 actions (keep, pick + use, create, opt-out, start). Player area is not accordion-heavy; its problem is a
flat stack of equal-weight cards, duplication and noise.

Clicks to reach (desktop, from chat):

| Task | Today | Note |
|---|---|---|
| Where am I / what now | 0 (HUD) / 1 | Play repeats it |
| Open journal | 2 | HUD card or Play launcher |
| Re-read briefing | 2 + scroll | button at page bottom |
| Fix a setup problem | 1-2 + Show me | |
| Read / curate memory | 2 + expand + scroll | |
| Your character | 2 + expand | |
| What could I do? | 2 | |
| Stat sheet | 2 | |
| Flag a moment | 2 + bare ⚑ + type | |
| Restart story | 2 + scroll + confirm | |
| Pause automatic images | 2 + scroll | |

## 2. Findings (ranked)

**P1. Play page has no hierarchy: setup noise and a duplicate status lead, the story comes second.**
`.so-play` (`Workspace.tsx` L60-87), `#so-setup`. Evidence `d10-play-full-played.png`, `m04-play-mobile-top.png`. The first
card is "Setup" with two "Weakens the story" rows: "memory model is not answering" and a library-overwrite warning
about another tab. The first is repeated in the pipeline line (`#so-pipeline-status`) and again in the HUD card (`d13`).
The second is install housekeeping, not a story problem. On mobile the entire first screen is Setup. A player who just
wants to play reads ~60 words of machine state before "Where you are". Hurts readability and navigation.

**P2. Play duplicates the Journal, and the Journal is the better surface.** `PlayerOverview` sections Where you are /
Recently / Quests vs `JournalPanel` Main line / Quests / Log (`d11` vs `d12-panel-journal.png`). Play shows "Quests: Find
more lamp oil" as bare text with no status; the Journal shows it with "Active". Two places answer "what is going on",
with different detail. The same goes for stats: Alarm shows on both the stat sheet and the story panels (`d12-panel-stat-sheet`,
`d12-panel-widgets`).

**P3. Review and Author nav items are dead ends for a player.** `WorkspaceShell.tsx` `PAGES.story` always lists 4 pages.
In player view 2 of 4 (`d05-workspace-review-no-story.png`) are the same wall text plus "Show author view". On mobile
they take half the bottom nav (`m04`). They are noise, and they invite a player to switch on spoilers. This conflicts
with "author adds, never conditionally reveals": the nav shows author entries the player cannot use.

**P4. No-story / solo-chat states mislead.** `Workspace.tsx` L83-86, `runtime/noGroup.ts` `noGroupView` returns null unless
a story was already selected or refused. In a one-on-one chat the Play page says "Choose a story for this chat."
(`d15-play-no-group.png`), so the player picks one and only then learns stories need a group. The page heading still
reads "Playing this story" with nothing playing (`d04`), the header says "This story", and Features / Review / Author
stay in the nav. The only action is "Open library", which moves to the other context. No story list here.

**P5. Start pane asks for a persona before saying what the story is, and its main action is buried.**
`BriefingModal.tsx` order: identity → carry → briefing. Evidence `d06-after-import.png`, `m01`. The player sees "Who
you are" and four ways to answer it (Play as X, choose another + Use this persona, Create a persona, "Closing keeps X")
before "Where you are / What you want". The story's own button ("Light the lamp") is a small `menu_button` bottom right
with the same weight as "Play as X". Two primaries compete, and it is unclear whether "Play as X" also starts the story.
Headings "Who you are in this story", the role line and the briefing section headings share one style. On mobile the
panel is translucent over ST's busy panels (`m01`), which hurts legibility.

**P6. Illustrations card always shows, even with images off for the install.** `index.tsx` L328 always passes
`imagePanel`. With `image.enabled: false` it still renders the pause toggle, model/quality/direction preferences and
Illustrate scene / Portrait / Background (`d11`). That is configuration on the Play page and a live path to ComfyUI from
a "player" surface. It is the second-largest card on the page.

**P7. Destructive and minor actions share one row with no weight difference.** Action row `Workspace.tsx` L80-84: Restart
story (destructive, `BusyButton`), Story briefing, and a bare ⚑ glyph (`FlagControl.tsx`, `opacity-70`, `aria-label` only).
They sit at the very bottom, after memory (`d10`). Restart is as easy to hit as reading the briefing. The flag's meaning
is a hover title.

**P8. Inconsistent type scale and button styles.** `d10`/`d11`: launchers ~16px with icons (`.so-launcher`), setup buttons
~15px, action row `st-button` ~13px, illustrations notes 12px, memory rows `text-xs opacity-80` (`MemoryTab.tsx`
`data-so="memory-tab"`), pipeline line `text-xs`. Three button families: `menu_button`, `st-button secondary`,
`so-launcher`. "What the story remembers" heading appears twice, as the summary and again inside (`MemoryTab` L132).
Cards are 1px outlines on flat `#202126`, so nothing reads as primary. ST's own drawers (`d03`) use denser, centred
labels and tinted blur panels, while ours is a flat dark sheet.

**P9. Wasted width on desktop.** `workspace.css`: `.so-workspace-content > * { max-width: 72rem; margin-inline: auto }` beside a
13rem nav leaves a ~280px dead gutter left of the content at 1920 (`d10`). The header plus context switch take 145px before
any content.

**P10. Mobile chrome eats the first screen.** `m04`: header (80px), This story / Orchestrator switch (60px), "← Back" (on
the root page, where Back closes), h2 "Playing this story". Content starts at ~280px of 844. The bottom nav has 4 items,
2 of them walls (P3).

**P11. Copy leaks machine framing.** "Following along. Waiting for the next reply." (`d10`), "Weakens the story" /
"Good to know" severity labels, "Memorize chat — Read the whole chat history into memory", Journal log rows prefixed
with boundary counters `#4`, `#3` (`d12-panel-journal`), "You left The mine road behind and moved into The mine gate."
(capitalised article mid-sentence, `narrative.ts` recently line). "About this story" shows the author's `description`.

**P12. Floating panels are oversized for their content.** `PanelFrame` default size: a 2/4 clock in a ~420x480 panel
(`d12-panel-widgets`), stat sheet the same (`d12-panel-stat-sheet`). "Open the story panels" opens one panel per widget,
stacked (`presenceUi.tsx` `openChatPanel`), and only the last is visible.

**P13. "Your character" hides what the player most needs to recall.** `YourCharacter.tsx` is a closed `<details>` in the
middle of the overview card. Its lines are one per `<p>` with large gaps (`d11`), and the locked hint is the last line.

**P14. Setup dismiss buttons are ambiguous.** "I have dealt with it, stop reporting these" next to "I know, keep it"
(`d04`). Two near-synonyms, the second greyed out. A player cannot tell which one hides the row.

## 3. Proposal

Principle: **Play is a story page, not a control panel.** One clear "where am I" header, the story's own reference
(journal, people, places, stats) in tabs, problems collapsed into one banner, and configuration moved to Features. The
player/author split stays as it is; in player view the author pages are simply not in the nav.

### 3.1 Information architecture (Story context, player view)

```
Story
  Play        ← overview: scene header, what now, story tabs
  Settings    ← was Features (per-chat feature switches incl. Illustrations prefs)
  (Review, Author: only in Author view; a single "Author view" toggle lives in Settings → bottom)
```

Play page sections, top to bottom:

1. **Scene header** (`#so-player-overview` keeps its id): scene name large, chapter chip ("Chapter 2 · The Mine"), one
   status sentence (pipeline) with its action inline, and a quiet "Catching up…" pill. The status sentence appears here only, never twice.
2. **Attention banner** (`#so-setup` keeps its id): one collapsed line "2 things need attention ▸". It expands
   inline to the rows. `blocks` rows render open and red; `degrades`/`info` start collapsed. Install housekeeping
   (library-lost, transcript copiers) moves to Orchestrator → Library/Help (audience `author`/`install`), not Play.
   Dismiss becomes one control, "Hide", with an undo toast inside the page (`ActionStatus`).
3. **Story tabs** (new `role="tablist"`, replaces the stacked sections and the journal duplication):
   `Now · Journal · People · Places · Stats · Memory`. Tabs that have no content are hidden.
   - Now: Recently, consequences, open threads, promises, carry card, "What could I do?" button.
   - Journal: quests with status, main line, log (no `#n`). Same component as `JournalPanel` (shared body).
   - People / Places: `CodexPage`.
   - Stats: stat sheet + widgets (one grid of compact cards; a clock is a 1-row card).
   - Memory: `MemoryTab` (heading not repeated), search and filters on one row.
   Each tab has a "Pop out beside chat" icon button that opens the existing floating panel. That replaces the "Beside the
   chat" card (ids `so-open-journal`… stay on those buttons).
4. **You** card (was a disclosure): avatar + persona name + role, one-line summary, "takes for granted" chips, locked hint
   as subtle text. Always visible, compact (2-3 lines).
5. **Footer row**: Story briefing, Flag a moment (icon + label), and Restart story right-aligned in danger style. Restart
   asks for confirmation in a native `<dialog>` that names what is lost.

Illustrations: the card leaves Play. Its per-chat preferences go to Settings (Features → Illustrations). The pause
toggle and Illustrate scene/Portrait/Background buttons show only when `image.enabled` is true, as a compact
"Illustrations" row under the scene header (the in-chat-act rule: generating a picture mid-turn is an act).

No-chat / no-group / no-story: one empty-state card per case, with the nav reduced to Play only.
- no chat: "Open a group chat to play a story" + Recent stories list (`EntryPoints` Continue rows reused).
- solo chat: "Stories play in group chats" + make-a-group card for the selected story, or a story picker that offers
  "make a group for it" (fix `noGroupView` to show the notice whenever a 1:1 chat is open, not only after a pick).
- group, no story: inline story picker (library rows, Import) instead of a jump to the other context.
Heading becomes the state ("No story in this chat"), never "Playing this story".

Start pane order: title + tone → briefing sections → **You** (role, summary, assumes) → persona choice as one segmented
control `[Play as X] [Choose…] [Create…]` with the inline form below it → footer: opt-out left, story's start button
right as the single primary (`.so-briefing-start` gets primary styling). Opaque panel background (no blur-through) and
a max width of 40rem; on mobile, full-screen sheet with a sticky footer.

### 3.2 Visual treatment

- One type scale in the workspace: 1.25rem page title, 1rem section headings, .9375rem body, .8125rem meta. No `text-xs` for
  body content. Scoped tokens on `#so-workspace-modal` (`--so-fs-*`, `--so-gap-*`).
- One button family: `.so-btn` (primary / secondary / quiet / danger) mapped onto ST's `menu_button` colours, so we match
  ST instead of mixing `st-button` and `menu_button`.
- Cards: tinted surface (`color-mix` of `--SmartThemeBlurTintColor`) instead of 1px outlines. The scene header gets the
  context accent bar. Remove the 72rem centring gutter: the content column is left-aligned next to the nav, with a
  64rem max width. Side margin goes away.
- Mobile: merge header and context switch into one 56px bar (title + overflow menu holding "Orchestrator" and Close).
  Hide Back on root pages. Make the story tabs a horizontally scrollable chip row, sticky under the header.

### 3.3 Wireframes

Desktop, played state:

```
┌ SO-UI Player Review ─────────────── This chat · Player ─── [Orchestrator ▾] [✕] ┐
│ Play     │ ▌The mine gate                          Chapter 2 · The Mine           │
│ Settings │ ▌Following the story — waiting for the next reply.   (catching up…)   │
│          │ ⚠ 1 thing needs attention ▸                                           │
│          │ ┌ You ─────────────────────────────────────────────────────────────┐ │
│          │ │ (◉) <persona> · a lantern-bearer for hire · can read a map   locked     │ │
│          │ └──────────────────────────────────────────────────────────────────┘ │
│          │ [Now] [Journal] [Places 1] [Stats 2] [Memory]           ⧉ pop out    │
│          │ Recently  You reached the mine gate.                                  │
│          │ Promises  To Arin: "I will get you home before dawn."                 │
│          │ [💡 What could I do?]                                                  │
│          │ ───────────────────────────────────────────────────────────────────── │
│          │ [Story briefing] [⚑ Flag a moment]                    [Restart story] │
└──────────┴────────────────────────────────────────────────────────────────────────┘
```

Mobile (390):

```
┌ SO-UI Player Review        ⋯  ✕ ┐
│ ▌The mine gate                    │
│ ▌Chapter 2 · waiting for reply    │
│ ⚠ 1 thing needs attention ▸       │
│ (◉) <persona> · lantern-bearer  locked  │
│ [Now][Journal][Places][Stats][Me…→│  ← sticky chip row
│ Recently …                        │
│ Promises …                        │
│ [💡 What could I do?]             │
│ [Briefing] [⚑ Flag]   [Restart]  │
├───────────────────────────────────┤
│   Play          Settings          │  ← 2 items in player view
└───────────────────────────────────┘
```

Empty state, solo chat:

```
│ No story in this chat                                        │
│ Stories play in group chats.                                 │
│ ┌ The Mine Road ───────────── needs: Arin, DM Narrator ─────┐│
│ │ [Make a group for this story]    [Open a group chat…]     ││
│ └───────────────────────────────────────────────────────────┘│
│ Recent stories: …  [Continue]                                │
```

### 3.4 Selectors that change (harness must follow)

| Now | After |
|---|---|
| `#so-workspace-page-review`, `#so-workspace-page-author` | rendered only in Author view (scripts that click them in player mode must switch view first; `so-ui.mts assert-player-clean` tab walk) |
| `#so-workspace-page-features` | id kept, label "Settings" (or new id `-settings` + alias; decide in WP1) |
| `#so-chat-side` card | removed. `#so-open-journal`, `#so-open-stat-sheet`, `#so-open-widgets`, `#so-open-suggestions` move to tab pop-out buttons / Now tab with the same ids |
| `#so-open-memory` (a `<summary>`) | becomes the Memory tab button (`role="tab"`, same id); `WorkspaceShell` reveal-by-`details` logic gains tab activation |
| `#so-your-character` (`<details>`) | `<section>`, same id, always open |
| `#so-image-chat` on Play | moves to Settings → Illustrations; quick actions get `#so-image-quick` under the header |
| `#so-setup` rows `data-so="setup-row"` | kept; `data-so="setup-dismiss"` label "Hide"; banner toggle `#so-setup-toggle` added |
| `#so-flag-moment` | kept, now icon + text |
| new | `#so-story-tabs`, `#so-story-tab-<id>`, `#so-scene-header`, `#so-restart-confirm` |

Consumers to update: `scripts/debug/so-ui.mts` (assert-player-clean, briefing, player-setup, help-showme-audit),
`runtime/workspaceRoutes.ts`, `runtime/drawerTab.ts` `storyPageFor`, `runtime/showMeRenders.ts`, `guide/tour/coachFlows.ts`,
`features/where.ts`/`registry.ts` (`where` targets), `components/help/HelpHost.tsx`, scenarios that use `expect_ui` on these
ids, and the related Storybook plays.

## 4. Work packages

| WP | What | Size | Deps | Risk | Touches |
|---|---|---|---|---|---|
| P-1 | Player nav: hide Review/Author in player view; Features→Settings label; empty states per case (no chat / solo / no story) with inline picker; fix `noGroupView` to fire on any 1:1 chat | M | — | low; harness clicks on review/author in player mode | `WorkspaceShell.tsx`, `Workspace.tsx`, `runtime/noGroup.ts`, `checks.ts`, Workspace/WorkspaceShell stories, `so-ui.mts`, help-showme-audit |
| P-2 | Attention banner: collapse setup, single status sentence (dedupe pipeline vs setup vs HUD card), move install-scope checks off Play, one "Hide" control | M | — | medium: check registry `audience`/`scope` semantics, `checksRegistry.test.ts` | `SetupSection.tsx`, `repair.ts`, `PlayerOverview.tsx`, `HudCard.tsx`, SetupSection/PlayerOverview stories |
| P-3 | Scene header + You card + footer row with danger Restart and confirm `<dialog>`; flag labelled | S | P-2 | low | `PlayerOverview.tsx`, `YourCharacter.tsx`, `FlagControl.tsx`, `Workspace.tsx`, stories |
| P-4 | Story tabs (Now/Journal/People/Places/Stats/Memory) sharing bodies with floating panels; pop-out buttons replace `#so-chat-side`; tab-aware deep links | L | P-3 | medium: `workspaceNavigation` control reveal, lazy chunks (keep tab bodies lazy, main bundle budget), journal page events | `Workspace.tsx`, `presenceUi.tsx`, `panels/*`, `codex/CodexPage.tsx`, `widgets/*`, `MemoryTab.tsx`, `WorkspaceShell.tsx`, `workspaceRoutes.ts`, new `PlayTabs.tsx` + stories |
| P-5 | Illustrations off Play: prefs to Settings, quick actions only when `image.enabled` | S | P-1 | low; image journeys use `#so-image-chat` | `index.tsx` L328, `image/ImageChatPanel.tsx`, `FeaturePages.tsx`, image scenarios/journey |
| P-6 | Start pane reorder: briefing first, segmented persona choice, single primary, opaque panel, mobile sheet with sticky footer | M | — | medium: persona lock flow (`v27-34-player-setup.json`, `so-ui.mts player-setup-choose`) | `BriefingModal.tsx`, `PlayerSetupPane.tsx`, `styles.css` briefing rules, Briefing stories |
| P-7 | Visual tokens: type scale, `.so-btn` family, tinted cards, remove centring gutter, mobile header merge + no root Back | M | — (best before P-3/P-4 land styling) | low-medium: Storybook visual churn, ST theme variance | `workspace.css`, `styles.css`, all player components' class names |
| P-8 | Copy pass: drop `#n` in journal log, recently-line article casing, severity labels → plain, "About" uses `public_intro` when present, memory heading once | S | — | low; drift tests on copy files | `narrative.ts`, `features/*Copy.ts`, `JournalPanel.tsx`, `MemoryTab.tsx`, narrative tests |
| P-9 | Floating panels size to content; "story panels" opens one tabbed widget panel, not N stacked | S | P-4 | low | `PanelFrame.tsx`, `presenceUi.tsx` `openChatPanel`, `WidgetPanel.tsx` |

Order: P-7 and P-8 (independent, cheap) → P-1 → P-2 → P-3 → P-5 → P-4 → P-9; P-6 any time. Every WP needs
`npm run gates:quick`, `npm run build`, a live check on a no-model lane with `so-ui.mts assert-player-clean`, and
updated `.stories.tsx`.

## 5. Open questions for the owner

1. Should Play absorb the Journal (tabs in the workspace, with pop-out to float beside the chat), or should the workspace
   stay a launcher and the floating Journal be the only story reference?
2. In player view, hide Review/Author from the nav entirely (author view toggle moves into Settings), or keep one
   "Author view" entry at the bottom of the nav?
3. Restart story: keep it on Play behind a confirm, or move it to Settings?
4. Start pane: do you want the briefing read before choosing who you play (proposed), or identity first as now?
5. Visual direction: match ST's own look closely (its blur tint and `menu_button` styling), or give the workspace its own
   calmer card style?
