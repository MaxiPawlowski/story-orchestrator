# UI review: settings (v3.0 plan 29, phase 1)

Area: configuration surfaces. The Extensions-panel block (`#story-orchestrator-settings`), the workspace shell
(`#so-workspace-modal`, `components/workspace/`), Orchestrator → Library / Defaults / Connections / Interface / Help, and
Story → Features (per-chat overrides).

Evidence: lane 30 (offline, no-model), build on master `cfec6b7e`, ST dark theme as seeded. I used a generic test group
`SO-UI Ferry group` (3 `SO-UI` cards) with fixture stories `SO-UI Ferry Crossing` (from `delivery`) and
`SO-UI Chapters Mini`, and removed them afterwards (`so-assets.mts assert-clean` is clean). The lane library's campaign
stories were removed from the lane copy only. Screenshots are in `C:\dev\so-lanes\ui-review\settings\`, with campaign
rows blurred. Metrics come from the live DOM inside `#so-workspace-content`.

## 1. Inventory

### Surfaces and how you reach them

| Surface | Reach from chat | Holds |
|---|---|---|
| Extensions block `#story-orchestrator-settings` (`src/index.tsx` `SettingsRoot`) | ST Extensions icon (1 click) | Title, status line, `#so-open-workspace`, `#so-open-setup` |
| Workspace shell `#so-workspace-modal` (`WorkspaceShell.tsx`) | top-bar route icon or wand (opens **This story → Play**), or Extensions → Open (opens **Orchestrator → Library**) | header, context switch (This story / Orchestrator), left nav (bottom bar under 700px) |
| Orchestrator → Library (`SettingsPanel` `library`, `EntryPoints.tsx`) | +1 (context) from the route icon | Start / Continue / Repair / Author cards, Getting started checklist, `Playing` accordion (story select, group default, transition note in a nested Advanced) |
| Orchestrator → Defaults (`FeaturePages.tsx` `install`) | +2 | search plus 29 feature cards in 5 groups; each card opens a detail page |
| Orchestrator → Connections (`SettingsPanel` `connections`) | +2 | accordions Memory (models, routes, chapters budget), World (lorebooks), Images (image service, picture types, model sources, sprite stage), Judge, Setup (capabilities, Ask) |
| Orchestrator → Interface (`DevicePreferences.tsx` + `PlayGroups.tsx` `DisplayGroup`) | +2 | "This device" list (12 rows), then "Display — this install" (notes, HUD, briefing, presence toggles) |
| Orchestrator → Help (`SettingsPanel` `help`) | +2 | 5 buttons (quick start, tour, setup path, Help and Ask, guide), accordions Authoring (Enable the wizard) and Setup (duplicate of Connections → Setup) |
| Story → Features (`FeaturePages.tsx` chat) | +1 | the same 29 cards; detail pages carry per-chat overrides with source chips |

### Disclosure count (live, everything expanded)

| Page | `<details>` | max nesting | inputs | `?` tooltips | height expanded (desktop / mobile) |
|---|---|---|---|---|---|
| Connections | 13 (5 areas + 8 nested) | 3 | 89 | 74 | 8,711 px (9.3 screens) / 10,111 px |
| Interface | 1 | 1 | 45 | 26 | 2,573 px |
| Library | 2 | 2 | 3 | 4 | 1,362 px |
| Help | 2 | 1 | 2 | 4 | 936 px |
| Defaults index | 0 | 0 | 1 (search) | 0 | 1,727 px (4,745 px mobile) |
| 29 feature detail pages | 1 each ("Advanced setup", which holds one link button) | 1 | 73 total, 50 feature controls | 0 | ~1,100 px each |

Across the Orchestrator context that is about 210 inputs over 5 pages plus 29 drill-down pages, and 47 `<details>`.
Accordion open state persists install-wide (`help.openSections`) and is shared between pages. Opening "Setup" in Help
also opens it in Connections.

### Clicks to reach (from the chat, route icon as the entry; current → proposed)

| # | Task | Path today | Now | Proposed |
|---|---|---|---|---|
| 1 | Change memory model | icon → Orchestrator → Connections → (Memory) → select | 4–5 | 3 (icon → Settings › Models → select), or search |
| 2 | Route one task to another model | … → Advanced → Models per task → select | 6–7 | 3 (Models page shows the route table inline) |
| 3 | Switch a feature off for every chat | icon → Orchestrator → Defaults → card → checkbox (→ back) | 5–6 | 3 (Features list, inline toggle) |
| 4 | Tune a feature for this chat only | icon → Features → card → control | 4 | 2–3 |
| 5 | Add judge key and enable | … Connections → Judge → paste, Save → Use the judge | 6+ | 4 |
| 6 | Toggle one judge use | … Judge → "What the judge is used for" → checkbox (or Defaults → card → checkbox) | 6 / 5 | 3 |
| 7 | Change notes-under-replies level | icon → Orchestrator → Interface → one of **two** selects | 4 (ambiguous) | 3, one control |
| 8 | Pick the story for this chat | icon → Orchestrator → Library → Playing ▸ → select | 4 | 2 (This chat → Story card) |
| 9 | Lorebook gating mode | … Connections → World → Advanced → select | 6 | 3 |
| 10 | Picture-type model | … Connections → Images → Image service → Picture types → type → model | 8 | 4 (Images › Picture types sub-page) |

## 2. Findings (ranked)

**S1. The same setting has two or three homes, with different labels and value vocabularies.** Settings, configuration,
consistency.
- Interface shows "This device" (`DevicePreferences.tsx`) and then "Display — this install" (`PlayGroups.tsx` `DisplayGroup` →
  `InlineControls`) on one page. Each pair is the same setting: "Notes under replies: `1`" vs "Notes under messages:
  Story", "Note categories" (raw ids `progress`, `memory`, …) vs "Which notes" (Progress, Memory…), "Notes on the last …
  replies" vs "Only the last … messages", "Status strip" vs "Show story status above the chat input", "Your move chip"
  vs "Show "Your move."". Nothing says which one wins. `ws-orchestrator-interface-expanded-desktop-full.png`.
- Sprite stage controls (dim, breathing, blink, mouth, live head) live in Connections → Images → Sprite stage, again in
  Interface → This device, and "Show stage" a third time in Defaults → Character stage.
  `ws-orchestrator-connections-expanded-desktop-full.png`, `ws-orchestrator-defaults-desktop-full.png`.
- `extraction.replyEffort` appears in Connections → Memory as "Medium (400 tokens, recommended)" and in Defaults →
  Reply thinking as `medium` (`ReplyThinkingField.tsx` vs `featureControls.ts:59`).
- Judge uses can be toggled in Connections → Judge (`JudgeSettingsGroup.tsx`) and on every feature detail page
  (`FeaturePages.tsx` `JUDGE_USES`).
- Illustration automation appears in Defaults → Illustrations ("When to draw", "Every … replies") and in Connections →
  Images ("When pictures are drawn", "Every N turns").
- Setup / Host capabilities and the "Ask questions" toggle render in both Connections and Help (`SettingsPanel.tsx`
  `show()`).
- The Getting-started overwrite warning prints twice on Library (Start card and Repair card).

**S1. Connections is one 9-screen accordion page that is mostly not about connections.** It has 13 details nested 3
deep, 89 inputs and 74 `?` tooltips. The World area is a header plus an "Advanced" disclosure that wraps its only real
control. Images nests Image service › Picture types and Model sources inside the area, plus a second Advanced. The page
also holds the chapter "Story so far budget", lorebook gating, every sprite animation toggle, a per-story destructive
action ("Remove generated sprites for this story") and the Ask switch. `SettingsPanel.tsx` (`show()` lumps
memory/world/images/judge/setup), `SettingsArea.tsx`, `Field.tsx` `Advanced`. `ws-orchestrator-connections-*.png`.

**S1. Settings CSS is scoped to the wrong root, so the workspace renders unstyled.** The `.so-settings-section`,
`.so-settings-area`, `.so-settings-area-guide` rules are scoped to `#story-orchestrator-settings`
(`styles.css:363-385`), but `SettingsPanel` now renders inside `#so-workspace-modal`. Two results:
- No area cards, no borders.
- Each area's guide `?` button, which should be absolutely positioned at the top right, drops below the section as a
  44 px orphan square. There is one under every area on Connections, Library and Help.

`ws-orchestrator-connections-desktop.png`, `ws-orchestrator-help-desktop.png`.

**S1. The Extensions-panel block is broken and unlike every other extension.** `SettingsRoot` puts `p-3 flex flex-col` on
the root, but Tailwind is scoped as descendants of the root (`styles.css:19`), so the classes never apply. The block
renders as a flex **row** with 0 padding, and both buttons clip their labels (`scrollWidth` 163 vs 145 px: "pen Story
Orchestrat", "ory setup and repa"). Every native extension is an `.inline-drawer` header row; ours is not. The
`openInlinePanel` path in `index.tsx` still looks for `.inline-drawer-toggle` and is dead. `01-st-extensions-panel-desktop.png`
vs `02-st-native-extension-inline-drawer-desktop.png`.

**S2. Defaults / Features use a drill-down page for single toggles.** There are 29 cards, and 16 of the 29 detail pages
hold one control ("Enabled"). Switching one feature off is card → page → checkbox → "← All features". Cards show the
state word but have no inline switch. Each detail page also repeats boilerplate:
- a timing paragraph ("finish under their existing run ownership")
- a "Model and connections" block that only links out
- an "Advanced setup" `<details>` whose entire content is a link button

`FeaturePages.tsx`, `FeaturePolicyFields.tsx`. `ws-orchestrator-feature-reading-desktop.png`.

**S2. Raw values and jargon reach the UI.** Examples:
- notes level `1` (`DevicePreferences.tsx` choice options `"0".."4"`)
- category ids in lowercase
- `low/medium/high`, and Reply polish mode `shadow` (`FeaturePolicyFields.tsx` `LABELS` misses them)
- "Leave newest … replies out" with no description
- `harness:opencode:openai/gpt-6.1-sol` shown in a select
- "untested" and "Off or waiting for its prerequisite" repeated on every judge row

Feature controls carry no description at all. Settings rows hide theirs behind `?` hover tooltips, which don't work on
touch.

**S2. Per-chat page writes install-wide state.** Story → Features detail pages show editable judge-use checkboxes that
change every chat (chip "Install"), mixed in with per-chat overrides (`FeaturePages.tsx:336-349`). The scope boundary
the page states at the top ("Changes apply only to this chat") is false for those rows.

**S2. Settings are misfiled.** "Enable the wizard" and "Ask questions" sit under Help. "Story so far budget" sits under
Connections. A per-story destructive sprite action sits in install settings. Library hides "Story for this chat" and
"New chats in this group start with" inside a `Playing` accordion under four task cards, next to an "Open story and chat
preferences" button.

**S2. There are two visual systems in one dialog.**
- Feature pages and Interface "This device" use `workspace.css`: 1 rem text, 44 px controls, source chips, row dividers.
- Connections, Library, Help and Interface "Display" use the old Tailwind settings look: 0.75–0.875 rem text, `?`
  tooltips, `border-white/10` dividers.

Control widths are arbitrary. A one-digit number gets a 1,070 px input ("Read every … replies", "Every N turns"), while
"700 tokens" and "As the profile sets it" get small inline selects that look like buttons. Judge-use selects are ragged:
each starts where its label ends. `conn*.png` crops, `ws-orchestrator-feature-reading-desktop.png`.

**S3. The workspace does not look like ST.**
- ST drawers are translucent (`--SmartThemeBlurTintColor` plus blur), dense, multi-column, with a **Search Settings**
  field (`03-st-native-user-settings-desktop.png`).
- Ours is an opaque full-screen `#202126` panel (`workspace.css:12` hardcodes `#202126` / `#292a30`), one centred
  72 rem column with 44 px rows on desktop, and the only search is feature-name search on Defaults.

**S3. Mobile wastes space on chrome.** Header, context switch and the "← Back" row take about 210 px, and the bottom nav
about 55 px, out of 844. "← Back" shows even on top-level pages. Feature detail stacks "← Back" over "← All features"
(two backs). Bottom-nav labels are 0.75 rem, and five items crowd the bar ("Connections" barely fits).
`ws-orchestrator-*-mobile.png`.

**S3. Library is noisy.** Getting-started rows wrap awkwardly in a narrow card (radio dot alone on a line, "Show me"
buttons on their own rows). The Repair card repeats the Start-card warning. Continue rows are truncated at about
20 characters with an "Open" button each. `ws-orchestrator-library-expanded-desktop.png`.

**S3. Some selectors are fragile.** `so-device-<index>` ids are positional (`DevicePreferences.tsx`), so inserting a row
renumbers them.

## 3. Proposal

### Principles
1. Every setting has **one home**. Other places show its value read-only with a "Change" link (a deep link through
   `workspaceNavigation.open({control})`).
2. Use a **left nav with flat sections and setting rows**. Descriptions are visible text, not tooltips. Each section has
   at most one level of drill-in, as a sub-page link ("Picture types ›") rather than a nested `<details>`. No
   accordion-in-accordion.
3. **Search everything.** One index built from `FEATURE_CONTROLS`, `SETTING_COPY`, `JUDGE_USE_COPY` and the device paths
   (the same sources `settingsReference.ts` already turns into the settings docs). A result jumps to the row and
   highlights it.
4. **Scope is a property of the row, not a page.** Each row carries a chip: Default / Story / This chat / This device,
   plus Reset. Device overrides become a chip on the install row instead of a second list.
5. **Density follows the input device.** Compact 32–36 px rows on `pointer: fine`, 44 px on `pointer: coarse`. Controls
   sit in a fixed-width right column (about 18 rem); numbers get small steppers.
6. Use ST tokens: blur tint, ST border and text colours, `menu_button` / native checkbox styling. Nothing is hardcoded.

### New information architecture

```
Workspace (native <dialog>, lazy)
├─ This chat            (player-safe; author adds)
│   ├─ Play             (unchanged; player area)
│   ├─ Story            ← story select + group default + restart/export (moved out of Library's Playing accordion)
│   ├─ Features         ← same FeatureList as Settings, scope = this chat
│   ├─ Review / Author  (author view only, unchanged)
└─ Settings             (install-wide; was "Orchestrator")
    ├─ [ Search all settings… ]
    ├─ Library          Start · Continue · Repair (one warning) · Author
    ├─ Features         flat grouped list, inline toggles; multi-control rows expand in place (one level)
    ├─ Models           memory model, fallback, test; "Tasks" route table (task | model | thinking | test) inline
    ├─ Judge            key + master switch, uses table grouped by feature (the one editable home)
    ├─ Images & stage   service, automation, safety; › Picture types; › Model sources; Stage (+ device chips)
    ├─ World & lore     gating mode, globally selected story books, late lore
    ├─ Display          notes under replies, HUD, briefing, panels (+ device chips)
    ├─ Authoring        wizard, Ask, chapters budget
    ├─ Diagnostics      host capabilities, bug-report copy, engine status (author)
    └─ Help             quick start, tour, guide, Help and Ask
```

What moves, merges or goes:
- **Merge.** "This device" folds into Display and Images & stage as a per-row device chip. `DevicePreferences.tsx` is
  removed as a page.
- **Merge.** Reply thinking gets one home, Features → Reply thinking, using the labelled values. Models shows it
  read-only.
- **Merge.** Judge uses get one home, Judge. Feature rows show "Judge: 3 checks on ›".
- **Merge.** Illustration automation gets one home, Images & stage. The Illustrations feature row links there.
- **Move.**
  - Chapters budget → Authoring (or into the Chapters feature row).
  - Wizard and Ask → Authoring.
  - Capabilities → Diagnostics.
  - "Remove generated sprites for this story" → This chat → Author.
- **Move.** Story for this chat and group default → This chat → Story.
- **Delete.**
  - `SettingsArea` accordions and the `Advanced` component.
  - The per-feature "Advanced setup" disclosure and the timing boilerplate (one footnote per page instead).
  - "Open story and chat preferences".
  - The duplicate Setup area in Help.
  - The duplicate overwrite warning.
- **Earned progressive disclosure, kept as sub-pages:** Models → Tasks (if the table is too wide on mobile), Images →
  Picture types, Images → Model sources, Stage → Animation details.

### Wireframes

Settings, desktop (1920):

```
┌ Story Orchestrator ─ Settings · all chats ──────────────[ Search all settings…    ]──[ Close ]┐
│ [This chat | Settings]                                                                        │
├──────────────┬───────────────────────────────────────────────────────────────────────────────┤
│ Library      │ Models                                                                         │
│ Features     │ Which Connection Manager profiles do the extension's work. Affects every chat.│
│▌Models       │ ───────────────────────────────────────────────────────────────────────────── │
│ Judge        │ Memory model                                     [ Memory RunPod        ▾ ]   │
│ Images&stage │ Reads the chat, writes memory and story progress.                             │
│ World & lore │ Fallback when it is down                         [ No fallback          ▾ ]   │
│ Display      │ Used when the memory model does not answer.                                   │
│ Authoring    │ [Test memory model]  last run: not tested                                     │
│ Diagnostics  │                                                                                │
│ Help         │ Tasks                                         task       model       thinking │
│              │ Each task can use its own profile.            Story reads [Same ▾] [Profile▾] [Test]
│              │                                               Summaries   [Same ▾] [Profile▾] [Test]
│              │                                               Wizard      [harness▾] [Profile▾] [Test]
│              │                                               …                               │
└──────────────┴───────────────────────────────────────────────────────────────────────────────┘
```

Features list, desktop (Settings scope; This chat scope adds Story/This-chat chips and Reset):

```
│ Features                                       [ Filter… ]  ( All · On · Off · Changed )        │
│ Memory ─────────────────────────────────────────────────────────────────────────────────────── │
│ Story reading            Reads replies to track facts and progress.      ● On   [▾ 2 more]     │
│   Read every … replies   How often a read runs.                          [ 1 ]  Default        │
│   Keep newest replies    Newest replies wait until they settle.          [ 0 ]  Default        │
│ Prompt memory            Adds remembered facts to prompts.               ● On                  │
│ Continuity               Restates facts a reply contradicts.             ● On   [▾ 1 more]     │
│ Characters ─────────────────────────────────────────────────────────────────────────────────── │
│ Rumors and gossip        Passes a story's rumors between characters.     ○ Off  Changed  Reset │
│ Reply polish             Checks off-voice wording; records only.         ○ Off  Judge: 0 on ›  │
```

Mobile (390): master/detail. One back button, no bottom bar, and search on the home list.

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Story Orchestrator     [✕]   │    │ ‹ Settings   Models     [✕]  │
│ [This chat | Settings]       │    ├──────────────────────────────┤
│ [ Search all settings…    ]  │    │ Memory model                 │
├──────────────────────────────┤    │ Reads the chat and writes…   │
│ Library                    › │    │ [ Memory RunPod          ▾ ] │
│ Features            29 on  › │    │ Fallback when it is down     │
│ Models          1 untested › │    │ [ No fallback            ▾ ] │
│ Judge                  off › │    │ ──────────────────────────── │
│ Images & stage         off › │    │ Tasks                      › │
│ World & lore               › │    │ [Test memory model]          │
│ Display                    › │    │                              │
│ Authoring                  › │    │                              │
│ Diagnostics       3 issues › │    │                              │
│ Help                       › │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

Extensions block, in an ST inline drawer like the native extensions:

```
┌ Story Orchestrator                                           ▾ ┐
│ ● A story is active in this chat · SO-UI Ferry Crossing         │
│ [Open settings]  [Setup and repair (2)]                         │
│ Models · Features · Library                    (deep links)     │
└─────────────────────────────────────────────────────────────────┘
```

### Constraints respected
- **Player/author split.** This chat → Play stays player-clean. Author pages stay gated. Settings rows that reveal story
  internals (engine status) stay author-only.
- **In-chat vs workspace.** All configuration stays in the workspace. The Extensions block only launches.
- **Native `<dialog>`.** Kept: one dialog, and sub-pages render inside it.
- **CSS scoping.** Settings styles move to `#so-workspace-modal`. The Extensions block gets a real scoped wrapper
  element so its own classes apply.
- **Bundle.** New code goes in lazy chunks: the search index is loaded on first focus; FeatureList and SettingRow ride
  the workspace/settings chunks. The main bundle should only lose `SettingsRoot` weight.
- **Storybook.** Every new part gets a `.stories.tsx`: SettingRow, SettingsNav, SettingsSearch, FeatureList, each section
  page, ExtensionsBlock.

### Selectors that would change (harness must follow)

| Selector | Change | Known users |
|---|---|---|
| `#so-area-<area>` (`details`), `data-so="settings-area"`, `data-so="settings-area-guide"`, `data-so="settings-advanced"`, `#so-area-*-advanced` | No longer `<details>`. Area ids become section ids, so they can't be `.open`ed | `scripts/debug/so-ui.mts:115`, `laneLoadAndStops.test.mts:45`, `test/journeys/j1-first-contact.journey.json:92,269`, `test/scenarios/v28-40-local-judge-uncalibrated.json:21`, `SettingsPanel.stories.tsx` |
| `#so-workspace-page-connections`, `-interface`, `-defaults` | Become `-models`, `-display`, `-features` (plus new `-judge`, `-images`, `-world`, `-authoring`, `-diagnostics`) | `so-ui.mts:37,51,153`, `so-workspace-check.mts`, `test/scenarios/live-v24-02-e3-save-evidence.json`, `v28-40-local-judge-uncalibrated.json` |
| `#so-workspace-page-features` (story) | Kept (This chat → Features) | `so-workspace-check.mts` |
| `#so-workspace-page-library`, `-help`, `-play`, `-author`, `-review` | Kept | many scenarios |
| `#so-feature-<id>-<field>` | Kept (rendered inline in the list) | `so-workspace-check`, scenarios |
| `.so-feature-card[data-feature]` | Becomes row `[data-so="feature-row"][data-feature]` | `so-workspace-check.mts` |
| `#so-feature-search` | Becomes global `#so-settings-search` (features filter `#so-feature-filter`) | none found |
| `#so-device-<n>` | Becomes `#so-device-<path-slug>` chip control | none found |
| `#so-open-workspace`, `#so-open-setup` | Kept, inside the inline drawer | `so-ui.mts`, journeys |
| Context switch buttons (by text "Orchestrator") | Label becomes "Settings". Add ids `#so-workspace-context-story` / `-orchestrator` | scripts that click by text |

`WorkspacePage` in `runtime/workspaceNavigation.ts`, `runtime/workspaceRoutes.ts` (`connectionsIntent`, `repairIntent`),
`features/registry.ts` `where` targets, `features/showMeTargets.test.ts` and `guide/tour/coachFlows.ts` all need to
follow.

## 4. Work packages

| WP | Scope | Size | Depends | Risk | Touches |
|---|---|---|---|---|---|
| S1 | Fix settings CSS scope: move `.so-settings-*` rules to `#so-workspace-modal`, so orphan `?` buttons and missing cards go away (stopgap, ships before the rework) | S | none | low | `styles.css`; `SettingsPanel.stories` visual check |
| S2 | Extensions block: ST `.inline-drawer` wrapper, real wrapper element so classes apply, status dot, deep links; remove dead `openInlinePanel` path | S | none | low | `index.tsx` `SettingsRoot` (extract to `components/settings/ExtensionsBlock.tsx` + story), `so-ui.mts open-settings` |
| S3 | `SettingRow` / `SettingSection` primitives: visible description, right control column, scope chip + Reset, density by pointer; ST tokens; remove hardcoded colours | M | S1 | low | new `components/settings/SettingRow.tsx` + stories, `workspace.css`, `Field.tsx` |
| S4 | Settings search index (lazy) from `FEATURE_CONTROLS` + `SETTING_COPY` + `JUDGE_USE_COPY` + device paths; search box, jump + highlight via `workspaceNavigation` `control` | M | S3 | low | new `features/settingsIndex.ts` (+ test against `settingsReference`), `WorkspaceShell.tsx` |
| S5 | New Settings nav and section pages (Models, Judge, Images & stage, World & lore, Display, Authoring, Diagnostics); delete `SettingsArea`/`Advanced`; split `SettingsPanel` by page | L | S3 | med (harness churn) | `SettingsPanel.tsx`, `WorkspaceShell.tsx`, `workspaceNavigation.ts`, `workspaceRoutes.ts`, `registry.ts` `where`, `coachFlows.ts`, `so-ui.mts`, `so-workspace-check.mts`, j1 journey, listed scenarios, `showMeTargets.test.ts` |
| S6 | `FeatureList`: flat grouped rows with inline toggle, in-place expansion for multi-control features, labelled option values, scope = install or chat; judge rows read-only in chat scope | M | S3 | med | replace `FeaturePages.tsx` index/detail, `FeaturePolicyFields.tsx`, `so-workspace-check.mts`, `live-v24-02-e3-save-evidence.json` |
| S7 | Dedupe: device overrides as row chips (Display, Stage); single homes for reply effort, judge uses, illustration automation, capabilities; move sprite removal to Author, wizard and Ask to Authoring | M | S5, S6 | med | `DevicePreferences.tsx` (removed), `deviceSettings.ts`, `PlayGroups.tsx`, `JudgeSettingsGroup.tsx`, `ImageGroup.tsx`, `SpriteGroup.tsx`, `settingsCopy.ts`, `docs:settings` |
| S8 | This chat → Story page (story select, group default, restart/export); Library cleanup (one warning, compact Getting started, continue rows) | S | S5 | low | `StoryGroup.tsx`, `GroupStoryBinding*.tsx`, `EntryPoints.tsx`, `GettingStarted.tsx`, `ContinueList.tsx` + stories |
| S9 | Mobile master/detail shell: one back in the header, section list home, no bottom bar for Settings | M | S5 | med | `WorkspaceShell.tsx`, `workspace.css`, `so-responsive.mts --surface` |

Order: S1 and S2 are quick wins. Then S3 → S4 / S5 / S6 (can run in parallel) → S7 / S8 / S9. Each closes on
`npm run gates`, with Storybook, plus a lane live check of `so-workspace-check.mts` and the changed scenarios.

## 5. Open questions for the owner

1. **Naming.** Rename the Orchestrator context to "Settings" and "This story" to "This chat"? And should the route icon
   open the last page used rather than always Play?
2. **Device layer.** With one user, keep per-device display overrides at all, or drop them and keep install values only?
3. **Switch style.** Use ST-native checkboxes, as ST's own panels do, or switch-style toggles for feature on/off rows?
4. **Container.** Keep the full-screen dialog on desktop, or use an ST-like translucent drawer about 1,100 px wide with
   the chat visible behind it?
5. **Expert rows.** Show per-task routes, recipe family and DWPose always (on sub-pages), or behind one "Show expert
   settings" toggle?
