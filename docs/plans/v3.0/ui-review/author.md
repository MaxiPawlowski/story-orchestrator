# UI review v3.0 plan 29: author area (phase 1)

Area: Author view surfaces and Checkpoint Studio. Workspace Story → Author (`#drawer-manager` DrawerTabs and every panel
they hold), Story → Review, inline author chips, message inspector `#so-inspector`, Checkpoint Studio `#so-studio-modal`
(all nine groups, graph, drill-down, mobile sheet) and its Wizard tab. Reviewed 2026-10-30 on lane 33 (no-model seed),
ST dark theme as installed, build `cfec6b7e` staged.

Fixture: three generic cards `SO-UI Guide/Narrator/Clerk` in group `SO-UI Group`; library imports of `character-life`
(roster renamed to the SO-UI cards, played), `factions` and `branching` (library only). State from `/send compact` +
`/sendas` (three boundaries), Author view on, inline level raised to 3 for chips (restored to 1). Cleaned up after: chat
deleted, chat meta wiped, three stories removed, `so-assets list --marker SO-UI` empty (cards and group gone), lane
`settings.json` restored from the pre-run copy, lane stopped.

Screenshots: `C:\dev\so-lanes\ui-review\author\` (`d-*` 1920x1080, `m-*` 390x844; tall captures are the full scroll
height). `d-st-native-worldinfo.png` shows ST's own Lorebook drawer for comparison.

Side finding (not UI): the lane is "no-model", yet importing the life story made two real authoring calls through the
opencode harness within a minute (`authoring:living`, `authoring:critic`, both `gpt-6.1-sol`, visible in Scheduler →
Calls, `d-tab-scheduler.png`). The living director and its critic are remote routes, so a no-model lane still spends
the owner's subscription. I switched living/curator/judge/extraction off in the lane right after. Harness consequence:
UI-review and no-model runs should set `stagecraft.livingEnabled: false` before importing (as `so-muted-scene-check`
does).

## 1. Inventory

### 1.1 Surfaces

| Surface | Reach from chat | Holds | Disclosures |
|---|---|---|---|
| Inline chips `#so-inline-<mesid>` | 0 (under newest message, level ≥ 1; author chips at 3) | 12 px icon buttons (category chips, magnifier = inspect, `?` legend) | chip expands inline |
| Message inspector `#so-inspector` | 1 (magnifier) → opens the workspace on Author with the inspector above the tabs | per-category sections (Progress = full blackboard JSON, Health) | 0 |
| Author page (Story → Author) | 2 (top-bar route icon → Author) | heading, Return to player view, Recent activity, DrawerTabs, Illustrate prepared cast | Recent activity, Illustrate prepared cast |
| Recent activity (`#so-open-activity`) | 3 | setup checks wall + filtered event feed with `#N` citations and per-row Detail | 1 + one per row |
| Overview tab (`#so-author-overview`) | 2 (default tab) | History floor, Engine (cp id, boundary, raw pipeline state), Pending writes, requirement dots, lore bindings, competing scenarios, Fix with wizard, Extraction dot, ScenePanel, PatternsPanel, Tension, Convergence bars; below: New story / Edit story / Update to the latest | 0–1 (Patterns) |
| Blackboard tab | 3 | key/value/next turn/source table (evidence in a per-row `<details>`), CharacterLifePanel, FactionsPanel | per-row Evidence, life meanwhile |
| Memory tab | 3 | player memory list + author row extras, ConflictQueue, AuthorMemoryControls (install-wide Enabled + epistemic toggles, Draft story-so-far, Memorize chat, last audit), MemoryPanels (Rumors, Echoes) | 2 |
| Scheduler tab | 3 | Author moves, Chapters, Living (branches), Stagecraft (curator), Speaker direction, Inner voice, Model calls, Extraction, Stall re-checks, Refused route, Expansion: 11 stacked sections, one scroll | Inner voice, Living |
| Payload tab | 3 | Lore that fired, scan gating, NextTurnPanel (contributors, Open Memory/Open settings per block), other extensions, Injected prompt payload | Other extensions |
| DriverPanel (under every tab) | 2 + scroll | Active cp, agency, unmet gates, Suggest / Probe / Report, Advance to…, Nudge | 0 |
| Illustrate prepared cast `#so-cast-scene` | 2 + scroll + expand | cast image panel (images off here) | 1 |
| Review page | 2 | StagecraftPanel again + a button to the Author page | 0 |
| Studio `#so-studio-modal` | 3 (route icon → Author → Edit story); also Library → Author | title input, issues chip, 9 group buttons, sub-tab row, editor, sticky footer (Undo, Redo, Export JSON, Import JSON, Save, Save As, Reset Draft) | see 1.2 |
| Studio graph (Flow → Graph) | 4 | cytoscape graph, + Checkpoint, + Transition, Re-layout, layout select, Mermaid export | 1 |
| Checkpoint drill-down | 5 (tap node) | desktop: jumps to the Checkpoints tab (graph gone); mobile: bottom sheet with Back to graph / Expand editor | — |
| Wizard (Assistant → Wizard) | 4 | 4 tab rows deep: group → "Wizard" → mode (Step by step / Agent / Ask / Build a character) → stage (Premise / Turning points / Characters / Setup) | 1 |
| Diagnostics (Validation) | 4, or the issues chip | Blocking / Warnings / Notes cards with code chip, sentence, raw detail, location | 0 |

Panels not exercised live (they render only when the story uses the feature): Living author detail, Factions, Rumors,
Echoes, Patterns, ConflictQueue rows, Chapters seals, Expansion entries, Inner voice rows. Read from source and their
`.stories.tsx`; they follow the same pattern (a `text-xs opacity-80` block with a `font-medium` heading).

### 1.2 Disclosure counts (live, `count.mts` pass)

Studio, per page: own `<details>` (not guide) / guide-topic `<details>` inside "How to write this" (nested 2 deep) /
`?` help icons / fields:

- Story setup → Story: 0 / 9 / 11 / 20
- Flow → Graph 1 / 0 / 1 / 3; Checkpoints 1 / 19 / 6 / 34 (+ 10 checkbox-gated effect cards that act as disclosures);
  Transitions 0 / 4 / 0 / 11; Chapters 0 / 5 / 1 / 3
- State and rules → Qualities 0 / 6 / 0 / 19; Game 0 / 14 / 9 / 10; Story rules 0 / 4 / 3 / 3
- Characters → Roster 0 / 15 / **28** / 33; Sprites 2 / 2 / 0 / 23
- World 0 / 5 / 4 / 3; Presentation 0 / 5 / **19** / 28
- Story features: **29** / 5 / 2 / 33 (29 policy accordions in one column, `d-studio-story-features-story-features.png`)
- Assistant → Wizard 1 / 0 / 0 / 3; Validation 0 / 0 / 0 / 2

Totals: 35 own disclosures, 93 guide-topic disclosures (max depth 2), ~84 help icons, 3 tab levels everywhere and 4 in
the Wizard. Five groups hold a single sub-tab (World, Presentation, Story features, Assistant, Validation), so their
second tab row is a lone pressed button.

Author page: 2 page disclosures + 1–4 inside panels; 5 drawer tabs of which one ("Scheduler") holds 11 unrelated
sections. Scroll heights at 1920x1080: Overview 1102 px, Scheduler 1274, Payload 1285; at 390x844 Blackboard reaches
2532 px for 12 keys (each key is a 100 px card).

### 1.3 Clicks to reach (from the chat, workspace closed)

1. Why did the story (not) move? Overview "Unmet gates" in Driver: route icon, Author, scroll past ~900 px = 2 + scroll.
2. Advance to a checkpoint / Nudge: same, Driver sits below the tab content on every tab = 2 + scroll + select + click.
3. Value of one quality: route, Author, Blackboard, scan unsorted table = 3 (no search).
4. What happened at message N: magnifier chip (12 px) = 1, but it opens the workspace and shows the full blackboard JSON,
   not what changed.
5. What did the model see next turn: route, Author, Payload = 3 + scroll.
6. Which model calls ran / failed: route, Author, Scheduler, scroll to "Calls" = 3 + scroll.
7. Review a curator proposal: route, Review = 2 (also duplicated in Scheduler).
8. Edit the open checkpoint: route, Author, Edit story, Flow, Checkpoints, pick = 6.
9. Fix a validation issue: Studio issues chip = 4, then find the field by hand (diagnostic cards have no jump).
10. Change a story feature policy: Studio, Story features, expand 1 of 29 accordions = 5.

## 2. Findings (ranked)

### Severity high

- **A1. "Scheduler" is a junk drawer.** `SchedulerTab.tsx` stacks Author moves, Chapters, Living, Stagecraft, Speaker
  direction, Inner voice, Model calls, Extraction, Stall re-checks, Refused route and Expansion in one column with no
  anchors. None of these is a scheduler; the tab label gives no hint where Living branches or model calls live. Same
  pattern, smaller: Blackboard tab hides Character life + Factions, Overview hides Scene + Patterns + Tension, Payload
  hides NextTurn, Memory hides Rumors/Echoes/Conflicts. Evidence `d-tab-scheduler.png`, source `DrawerTabs.tsx:30-36`,
  `tabs/*.tsx`. Hurts: discoverability ("why did X happen" starts with "which tab?"), debugging.
- **A2. The Driver (the author's steering wheel) is below the fold on every tab.** `DrawerTabs.tsx:157-172` renders
  DriverPanel after the tabpanel, so it repeats under each tab and moves with tab height (y≈850 Overview, ≈1020
  Scheduler, ≈1030 Payload). Advance/Nudge/Probe, the most frequent author actions, need a scroll each time. Evidence
  `d-tab-*.png`, `m-tab-blackboard.png` (bottom of 2782 px).
- **A3. Requirement dots do not show state.** All five `StatusDot`s render the same olive (198,193,151) whether ready or
  missing (Persona ready, Extraction off: identical), `d-author-page.png` at x=490. `styles.css:215-231` uses
  `--st-success/--st-error`, which resolve to the same theme color here (or ST's own `.status-indicator` wins). Only the
  small "Off —" sentence tells. Hurts: readability, a setup dashboard that says nothing.
- **A4. Story features is a 29-accordion wall.** `StoryFeaturesEditor.tsx` + `FeaturePolicyFields`: every policy is a
  collapsed `<details>` labelled "· Default"; nothing visible without opening each. Evidence
  `d-studio-story-features-story-features.png`. Hurts: configuration, scanning which policies differ from default.
- **A5. Checkpoint editor is one 2,400 px form with raw JSON.** `CheckpointEditor.tsx`: name, objective, player-facing
  block, type, tension, guidance, private direction, snapshot, 10 effect toggles, talk control, motives, open opening,
  **Offers as a raw JSON textarea** (`[{"id","text","visible_when"?...}]`), agency, scope preview, delete. No section
  nav, no sticky header naming the checkpoint. Evidence `d-studio-flow-checkpoints.png`. Hurts: editor ergonomics,
  error-prone authoring.
- **A6. Graph is unreadable at both extremes.** Small graphs are auto-fit and zoomed ~3x (11 px labels render ~36 px,
  160 px nodes, `d-studio-open.png`); edges are near-black on dark (`line-color: themeColors.border`); edge labels show
  the raw gate (`rel_arin_player_trust >= 2`); anchor and start look the same as every node (olive fill, start only a
  double border). Clicking a node on desktop leaves the graph for the Checkpoints tab (`d-studio-node-click.png`), so
  graph + editor are never side by side. Source `graphPanelUtils.ts:108-158`, `StudioGraph.tsx`. Hurts: the Studio's
  main overview of the story is its weakest screen.
- **A7. Three to four stacked tab rows in the Studio.** Group row (9) + sub-tab row (1–4) + Wizard mode row + Wizard
  stage row; five groups have a single sub-tab whose row is pure chrome. On mobile both rows scroll horizontally with
  visible scrollbars and the editor gets ~230 px (`m-studio-flow-graph.png`, `m-studio-node-tap.png`,
  `m-studio-assistant-wizard.png`). Source `StudioModal.tsx:44-70`.

### Severity medium

- **B1. Inspector answers the wrong question.** "Progress: Boundary 3 evaluated" followed by the whole blackboard as
  JSON (`d-inspector.png`); no diff (what changed at this message), no transition reason, no prev/next message, the
  "message 8" citation button duplicates the heading. It opens inside the full workspace dialog, which hides the chat
  you were inspecting. Source `MessageInspector.tsx`, `runtime/messageInspector.ts`.
- **B2. Inline author chips are 12 px unlabeled icons** (`d-inline-chips-zoom.png`): warning, magnifier, `?`. The only
  path into the inspector is a 12 px magnifier on the newest message; expanding a chip shows one plain sentence.
- **B3. Settings live inside debug views.** Memory tab shows install-wide "Enabled" and "Epistemic/ledger extraction"
  checkboxes (`AuthorMemory.tsx:11-18`, `d-tab-memory.png`); Payload rows carry "Open settings". Configuration belongs to
  Features/Defaults (CLAUDE.md UI rule: workspace = configure). An author poking at memory can switch memory off for
  every chat.
- **B4. Recent activity opens with a wall of setup text.** The activity disclosure starts with every check's full
  detail (one row listed ~90 missing library ids in one paragraph), then a full-width "Show" select, then events with
  boxed `#8` citation buttons (`d-author-activity.png`). Setup checks already have their own surface (`#so-setup`).
- **B5. Raw machine strings in author copy.** "Pipeline: not-configured", "start · boundary 3" (checkpoint id, not name),
  gate expressions with compiled keys, `authoring:critic · harness:opencode:openai/gpt-6.1-sol`. Author view may show
  ids, but each should sit next to the human name.
- **B6. Character data is split by feature, not by character.** Roster page: cast cards, then Voice and delivery per
  member, Relationship labels per member, Promises per member, Cues and topics per member, Factions, Player card, plus
  28 `?` icons (`d-studio-characters-roster.png`). Checkpoint motives repeat per member again. To see everything about
  one character the author scrolls 3,000 px and four sections. Remove buttons are a bare "×".
- **B7. Diagnostics are not actionable.** Cards show code chip, sentence, raw detail, location text, but no "Go to"
  button (`d-studio-validation-diagnostics.png`, 0 buttons). Also worth verifying: `undeclared-quality` flags
  `rel_arin_player_trust`, a key compiled from the roster's relationship axes (runtime has it on the blackboard), as
  Blocking; it looks like a diagnostics false positive for life-compiled keys (not checked in jest).
- **B8. Three button vocabularies side by side.** `menu_button` (91 uses), `st-button secondary/primary/danger`
  (~140), Tailwind-sized variants; on one screen "Return to player view" (st-button), tabs (menu_button, 18 px text) and
  "New story" (menu_button, dimmed) differ in size, weight and border (`d-author-page.png`). "Draft a checked
  story-so-far" is full width, "Memorize chat" beside it is not.
- **B9. Type scale is erratic.** Panel bodies are `text-xs` (12 px) with `opacity-80`; requirement labels and tab labels
  are 18 px; section titles are 12 px `font-medium`. Hierarchy comes from opacity, not size. Large gutters: content
  column starts at x=483 of 1920 with 270 px empty on its left (`d-author-page.png`).

### Severity low

- **C1. Review page duplicates Scheduler's Stagecraft** and links to Author for life/living proposals: two places, half
  each. `Workspace.tsx:91-92`.
- **C2. "How to write this" on every Studio page** is a collapsed block whose topics are again collapsed (93 nested
  disclosures), and each topic's `fields` line is raw `<code>`. Help is present but costs two clicks per topic.
- **C3. Mobile Blackboard table becomes one 100 px card per key** (`m-tab-blackboard.png`), Payload tab wraps alone on a
  second tab row (`m-author-top.png`), Studio title input truncates to "SO-UI Li", footer is 7 buttons on two rows.
- **C4. Blackboard has no grouping or filter:** derived clock keys (`story_day`, `time_part`, `is_night`) sit among
  authored and life keys; no "changed this turn" mark beyond the Next turn column, no search.
- **C5. Studio header**: the title is an always-editable full-width input, the issues chip is 11 px; Save/Save As/Reset
  sit bottom-left with equal weight, Reset Draft next to Save.

Comparison with ST (`d-st-native-worldinfo.png`): ST packs a drawer into one header row + one icon toolbar (Font
Awesome icon buttons, 14 px rows, search field first, sort select). Ours uses text buttons everywhere, no icons in
toolbars, no search, and larger chrome per screen.

## 3. Proposal

Guiding idea: the author has two jobs, **debug a run** (Author page, in-chat chips, inspector) and **edit a story**
(Studio). Each gets one navigation model, sections named after the question they answer, and progressive disclosure only
for long text. Author view keeps adding, never revealing on the player surface (all of this stays behind
`ui.authorView`).

### 3.1 Author page: a run console

Replace the five tabs + trailing Driver with a two-pane console inside the existing workspace page:

- **Left rail (sticky): Steer.** Current checkpoint (name + id), boundary, pipeline state in words, unmet gates as
  readable rows ("Guide's trust toward the player ≥ 2, now 0 → The confession"), then Suggest / Probe / Report,
  Advance to…, Nudge. Always visible: the Driver stops moving.
- **Right: sections as a vertical sub-nav (desktop) / segmented list (mobile)** named by question:
  - *Health* (was Overview requirements + Extraction + History floor + setup summary): status chips with icon + color +
    word ("Ready", "Missing", "Off"), Fix with wizard, Edit story / New story / Update to the latest as a header action.
  - *State* (Blackboard + Character life + Factions + Tension + Convergence + Scene): searchable, grouped table
    (Gates / Authored / Life / Clock / Faction), "changed at boundary N" highlight, evidence in a side popover not a row
    disclosure.
  - *Memory* (author memory, Conflicts, Rumors, Echoes, Patterns): rows only; the install toggles move to Features.
  - *Prompt* (Payload + NextTurn + lore fired + scan gating): one "next reply" composition view.
  - *Proposals* (Stagecraft curator + Living branches + Meanwhile + Agenda proposals): the one place to accept/reject;
    Review page becomes a deep link to this section (badge count on the nav item).
  - *Activity* (Recent activity, author moves, speaker direction, stall re-checks, refused route): one timeline with
    filter chips by kind, message citations as small links, setup checks reduced to a one-line link to Health.
  - *Pipeline* (Model calls, Extraction, Expansion, Inner voice coverage, Chapters seals): background workers with
    status pills and last error.
- Section headings become real headings (14 px semibold), body 13 px; opacity no longer carries hierarchy.

### 3.2 In-chat chips and the inspector

- Author chips grow to ST's `mes_button` size (≈ 20 px hit area) with a short text label at level ≥ 3 ("+2 trust",
  "→ The confession", "health"), on every message in the window, not only the newest.
- The inspector becomes a **side panel** in `#so-panels-root` (floating panel, docks above `#form_sheld` on mobile), so
  the chat stays visible: header "Message 8 · boundary 3" with ‹ › to step messages, sections *What changed* (blackboard
  diff, writes and their reader/confidence), *Why* (transition fired / gate still unmet with values), *Prompt* (blocks
  injected for that reply), *Health*. Full JSON only behind "Raw" (level 4). "Open in Author page" link for depth.
  This respects the in-chat rule (glance mid-turn, chat visible).

### 3.3 Studio: one nav, master-detail editors

- **Left sidebar nav** (desktop ≥ 1000 px) replacing both tab rows: Story · Flow (Graph, Checkpoints, Transitions,
  Chapters) · State (Qualities, Game, Rules) · Characters (one entry per cast member + Sprites) · World · Presentation ·
  Features · Assistant · Validation (with count badge). Groups with one page are a single link (no second row). Mobile:
  the sidebar becomes a top "section" select + back, one row of chrome.
- **Header**: title as text with an edit pencil, issues badge (opens Validation), Save (primary), overflow menu (Save
  As, Export, Import, Reset draft, Mermaid export). Undo/Redo as icon buttons in the header.
- **Flow = graph + inspector side by side** on desktop: graph left (60%), selected checkpoint/transition editor right
  (40%) with a section index (Basics, Player sees, Effects, Cast, Agency, Scope). Clicking a node never leaves the graph.
  Mobile keeps the bottom sheet but with a half/full snap and no duplicate graph toolbar.
- **Graph styling**: `maxZoom` cap so small graphs stay at 1x, node fill by type (start = accent ring + "Start" badge,
  anchor = solid accent, intermediate = outline, stub = dashed), edge lines at `--st-text` 50%, edge labels from the
  gate's readable form (quality display names, "≥"), raw expression on hover.
- **Checkpoint editor**: section index at top (sticky), effects as a list of added effects with "+ Add effect" menu
  (instead of 10 checkbox cards), Offers as a repeatable row editor (text, visible when, needs) built on the existing
  gate picker, raw JSON only in an "Edit as JSON" escape hatch.
- **Characters: one page per character** (identity, voice, relationships + labels, promises, cues/topics, drive and
  motives per checkpoint as a read-only list linking to the checkpoint, sprites tab). Cast-wide things (factions, player
  card) stay on the Characters overview.
- **Features: a table, not accordions.** One row per policy: name, one-line description, state pill (Default / On /
  Off / Custom) and an inline toggle; rows with extra options open a right-side detail drawer. Filter "Changed from
  default". Same component can back the workspace Features page (shared with the settings reviewer).
- **Help**: "How to write this" becomes a `?` button in the page header opening the guide reader panel at that topic
  (it already exists, `#so-help-open-guide`); inline `?` icons stay only on fields whose label is not self-explanatory
  (target: halve the 84).
- **Validation**: each card gets "Go to" (selects the checkpoint/transition/field and focuses it); group by location;
  codes as small mono suffix.
- **Wizard**: mode as a segmented control in the page header (Step by step / Agent / Ask / Build a character), stages as
  a numbered stepper (1 Premise → 2 Turning points → 3 Characters → 4 Setup) with done/current state; the lone "Wizard"
  tab row disappears.

### 3.4 Visual treatment

- One button system scoped to our roots: `primary` (one per view), `secondary`, `ghost` (toolbar, icon + label),
  `danger` (confirm). Map `menu_button` uses inside our roots onto it; keep ST's look (colors from SmartTheme vars,
  ST border radius), add Font Awesome icons in toolbars as ST does.
- Status: icon + color + word everywhere (fix A3 by defining our own `--so-ok/--so-warn/--so-bad` from SmartTheme with
  a contrast fallback, never color alone).
- Type scale 12 / 13 / 14 / 16 / 20, max content width 1100 px left-aligned against the nav (no 270 px dead gutter).
- Tables: sticky header, zebra rows at 3% white, mono for keys, search box above.
- All in existing mount roots (`#so-workspace-modal`, `#so-studio-modal`, `#so-panels-root`), native `<dialog>` kept.

### 3.5 Wireframes

Author page, desktop:

```
+-- This story · Author view -------------------------------------------- [Close] --+
| Play | Features | Review(2) | Author*                                              |
+--------------------+---------------------------------------------------------------+
| STEER (sticky)     | Health  State  Memory  Prompt  Proposals(2)  Activity  Pipeline|
| The market (start) |---------------------------------------------------------------|
| boundary 3 · idle  | State                                  [search keys____] [All v]|
| Unmet gates        | Gates                                                          |
|  Guide trust ≥2  0 |  rel_arin_player_trust   0   → —   extractor 82%  [evidence]   |
|   → The confession | Life                                                           |
| [Suggest][Probe]   |  Guide · calm · trust 0 · fear 0 · agenda 1/3 next: docks     |
| [Report]           | Clock   Day 1 morning (story_time 0)                           |
| Advance to [v][Go] | Convergence  The market ▓▓░░ 0/1   The confession ░░░░ 0/1     |
| Nudge [______][>]  |                                                                |
| [Edit story]       |                                                                |
+--------------------+---------------------------------------------------------------+
```

Author page, mobile (390):

```
+ SO-UI Life lab · Author        [x] +
| [Steer ▾]  boundary 3 · The market |   <- collapsible sticky bar, opens Steer sheet
| Section: [ State          v ]      |
| [search keys______]                |
| rel_arin_player_trust   0   gate   |
| rel_arin_player_fear    0          |
| story_day               1   clock  |   <- one 36 px row per key, not a card
+------------------------------------+
| Play  Features  Review  Author*    |
+------------------------------------+
```

Inspector side panel:

```
+ Message 8 · boundary 3     ‹  ›  [x] +
| What changed                         |
|  trust toward player  0 → 0 (read)   |
|  agenda debt step     0 → 1 (code)   |
| Why                                  |
|  Stayed at The market: trust ≥ 2     |
|  unmet (0). No transition fired.     |
| Prompt  3 blocks · 1,020 chars  [>]  |
| Health  Automatic reading is off [>] |
| [Raw]               [Open in Author] |
+--------------------------------------+
```

Studio, desktop:

```
+ Checkpoint Studio  SO-UI Life lab ✎   (3 issues)   [↶][↷]   [Save] [⋯] [Close] +
+--------------+-------------------------------------+---------------------------+
| Story        |  GRAPH                [+cp][+tr][⟳]  | The market   start·anchor |
| Flow       > |                                     | Basics Player Effects ... |
|  Graph *     |      (The market)                   | Name   [The market     ]  |
|  Checkpoints |          |  Guide trust ≥ 2         | Objective [Meet Guide. ]  |
|  Transitions |      (The confession)               | Effects  + Add effect ▾   |
|  Chapters    |                                     |  · Author note   [edit]   |
| State        |                                     | Offers   + Add offer      |
| Characters   |                                     |  "Ask about the debt" ... |
|  Guide       |                                     | Agency  World pressure v  |
|  Narrator    |                                     |                           |
| World        |                                     |                           |
| Presentation |                                     |                           |
| Features     |                                     |                           |
| Assistant    |                                     |                           |
| Validation 3 |                                     |                           |
+--------------+-------------------------------------+---------------------------+
```

Studio, mobile:

```
+ Studio  SO-UI Life lab ✎  (3)  [Save][⋯] +
| Section [ Flow · Graph            v ]     |
|                                            |
|        (The market)                        |
|            | Guide trust ≥ 2               |
|        (The confession)                    |
|                                            |
|--- sheet (half) --------------------------|
| The market  start·anchor      [full][x]   |
| Basics | Player | Effects | Agency  >      |
+--------------------------------------------+
```

Features table:

```
| Feature                 | What it does                         | State    |      |
| Story reading           | reads the chat to move the story     | Default  | [on] |
| Private inner voice     | per-member private thoughts          | Custom   | [>]  |
[x] Only changed from default        [search features____]
```

### 3.6 Selectors that change (harness must follow)

- Drawer tab labels "Overview/Blackboard/Memory/Scheduler/Payload" are matched by **text** in
  `scripts/debug/so-ui.mts:546,809-826` (`#drawer-manager [role="tablist"] button` + `data-so-tab`) and in 41 harness
  files referencing `#drawer-manager`. New section ids: keep `#drawer-manager` as the console root, keep `role="tab"`
  and `data-so-tab` on the section nav with new values (`health|state|memory|prompt|proposals|activity|pipeline`), and
  ship an alias map old → new in `so-ui.mts` drawer-tab for one release. `DRAWER_TAB_OF_CONTROL`
  (`runtime/surfaceShown.ts`) and `workspaceNavigation` control targets move with it.
- Kept as is: `#so-author-overview` (becomes the Health section root), `#so-author-story-controls`, `#so-edit-story`,
  `#so-update-story`, `#so-author-new-story`, `#so-history-floor`, `#so-branch-from-oldest`, `#so-fix-with-wizard`,
  `#so-author-moves`, `[data-so=blackboard-row]`, `[data-so=author-move]`, every `data-so` on panel rows.
- `#so-inspector`, `#so-inspector-close`, `[data-so=inline-inspect]`, `[data-so=inspector-section]`: kept, but the
  inspector moves from the workspace into `#so-panels-root`; the 2 scripts and 4 tests that look for it inside the
  workspace need the new parent (`scripts/debug/so-ui.mts` inspector helpers, `inlineTimeline` stories).
- `#so-open-activity` (`<summary>` today, 2 scripts + 3 tests) becomes a nav item with the same id.
- Studio: tab selection by `[role="tab"]` text in `so-ui.mts:749,782` and 12 harness files. Keep `role="tab"` on
  sidebar links with the same labels for leaf pages (Graph, Checkpoints, Roster → "Characters"...), keep
  `#so-studio-modal`, `#so-studio-root`, `#so-studio-guide` (becomes the header help button), `[data-so=wizard-step]`,
  `[data-so=wizard-stage]`, `#so-studio-ask`, `#so-character-tutorial`, `#so-wizard-questions`. `Roster` splitting into
  per-character pages changes the `studio-tab Roster` harness verb: keep a "Characters" overview page with the old
  tab label "Roster" as alias.
- Footer buttons move into the header/overflow: `studio-save` verb (`so-ui.mts:1548`) must click Save by id; add
  `#so-studio-save`, `#so-studio-save-as`, `#so-studio-export`, `#so-studio-import`, `#so-studio-reset`.

## 4. Work packages

Every package keeps or adds `.stories.tsx` for each touched part, runs `npm run gates:quick` per change and closes on
`npm run gates`; UI packages also run `so-ui.mts assert-player-clean` and a lane screenshot pass. New code rides lazy
chunks (DrawerTabs, Studio and inspector are already lazy), so the main bundle budget is not at risk.

- **WP-A1 Status and button primitives (S, no deps, low risk).** `--so-ok/warn/bad` tokens with contrast fallback, fix
  `StatusDot` (A3), one `SoButton` variant set mapped onto `menu_button`/`st-button` inside our roots, type scale
  tokens. Touches `styles.css`, `OverviewTab.tsx`, `BusyButton`, stories for StatusDot/Toolbar. First, because every
  later package uses it.
- **WP-A2 Author console shell (M, after A1, medium risk).** Steer rail (DriverPanel moved, sticky), section nav
  replacing DrawerTabs, sections re-homed from the five tabs (pure moves of existing panels, no panel rewrites), Review
  page → Proposals deep link, settings toggles out of Memory (B3) into Features. Touches `DrawerTabs.tsx`,
  `tabs/*.tsx`, `Workspace.tsx`, `surfaceShown.ts` `DRAWER_TAB_OF_CONTROL`, `so-ui.mts` drawer-tab alias,
  `DrawerTabs.stories.tsx`, `Workspace.stories.tsx`, journeys using drawer tabs. Biggest harness churn.
- **WP-A3 State table and Activity timeline (M, after A2, low risk).** Searchable grouped blackboard, changed-at
  highlight, evidence popover; activity filter chips, setup wall reduced to a Health link, compact citations. Touches
  `BlackboardTab.tsx`, `runtime/blackboardView.ts`, `ActivityPanel`, `activityFeed.ts`, stories + their tests.
- **WP-A4 Inspector side panel + readable chips (M, after A1, medium risk).** Inspector in `#so-panels-root` with
  prev/next, What changed (diff from boundary logs), Why (gate values), Prompt link; chips labelled at level ≥ 3 and
  sized like ST message buttons. Touches `MessageInspector.tsx`, `runtime/messageInspector.ts` (diff projection, pure,
  tested), `presenceUi.tsx`, `inline/InlineStrip.tsx`, `inline.css`, inspector scripts. Needs owner OK on in-chat
  placement (Q2).
- **WP-S1 Studio navigation shell (M, after A1, medium risk).** Sidebar nav + mobile section select, header with Save
  + overflow + undo/redo, single-page groups without second row, wizard mode/stage controls. Touches
  `StudioModal.tsx`, `mobile.css`, `StudioModal.stories.tsx`, `so-ui.mts` studio-tab/studio-save, 12 harness files with
  `[role=tab]`, `t5Studio*/t52Studio*` review tests.
- **WP-S2 Graph readability + side-by-side drill-down (M, after S1, low-medium risk).** maxZoom, type styling, readable
  gate labels, edge contrast, desktop split view, mobile half/full sheet. Touches `graphPanelUtils.ts`,
  `GraphPanel.tsx`, `StudioGraph.tsx`, graph stories, `graphPanelUtils.test.ts`.
- **WP-S3 Checkpoint editor sections + effect list + Offers row editor (L, after S1, medium risk).** Section index,
  "+ Add effect" list replacing checkbox cards, Offers row editor with "Edit as JSON" escape. Touches
  `CheckpointEditor.tsx`, `components/studio/checkpointEditor/*`, `mutations.ts` (offers ops, typed, tested),
  CheckpointEditor stories, `mutations.test.ts`.
- **WP-S4 Features table (S/M, after A1, low risk; shareable with the settings reviewer's Features page).** Table with
  state pills, inline toggle, detail drawer, "changed only" filter. Touches `StoryFeaturesEditor.tsx`,
  `FeaturePolicyFields.tsx`, `workspace/FeaturePages.tsx`, their stories.
- **WP-S5 Per-character pages (L, after S1, medium risk).** Characters overview + one page per roster member that
  gathers voice, labels, promises, cues/topics, motives, sprites. Pure re-composition of existing editors. Touches
  `RosterEditor`, voice/labels/promises/cues editors, sprites, stories, `studio-tab Roster` alias.
- **WP-S6 Actionable diagnostics + guide button (S, after S1, low risk).** "Go to" per diagnostic (needs a location →
  editor focus map from `diagnostics.ts` paths), "How to write this" → header help opening the guide reader at the
  topic, prune redundant `?` icons; verify the `undeclared-quality` life-key report (B7). Touches `DiagnosticsPanel`,
  `GuideDisclosure.tsx`, `guideTabs.ts`, `copilot/guideCoverage.test.ts` (coverage must stay green).

Order: A1 → (A2, S1 in parallel) → A3, A4, S2, S4, S6 → S3, S5.

## 5. Open questions for the owner

1. Run console layout: sticky **Steer rail on the left** with sections on the right, or Steer as a collapsible bar on
   top (one column, more like today)?
2. Inspector: OK to open it as a **floating panel beside the chat** (chat stays visible) instead of inside the
   workspace dialog?
3. Studio nav: **left sidebar** (proposed) or keep top tabs but flattened into one row?
4. Characters: split the Roster into **one page per character**, or keep feature-grouped sections with a character
   filter?
5. Icons: adopt Font Awesome icon buttons in toolbars like ST (denser, less text), or keep text-only buttons?
