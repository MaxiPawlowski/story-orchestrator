# UI review v3.0 plan 29: design system (phase 1)

Area: the visual language every surface shares. `src/styles.css` (1,170 lines, Tailwind 4 scoped to mount roots),
`components/workspace/workspace.css`, `studio/mobile.css`, `components/inline/inline.css`, shared primitives
(`BusyButton`, `ActionStatus`, `Lazy`, `components/settings/Field.tsx`, `components/studio/{FeedbackAlert,HelpTooltip,Toolbar}`,
`components/panels/PanelFrame.tsx`), tabs, disclosures, typography, spacing, colour vs ST theme variables, icons,
buttons/inputs/toggles, empty/loading/error states, focus/a11y, motion, dark/light.

Evidence: lane 35 (no-model, offline copy), synthetic group `SO-UI Group` (4 `SO-UI` cards) playing `test/fixtures/factions.story.json`
renamed `SO-UI Factions lab`. Cleaned up afterwards (`so-library remove`, `/delchat`, `so-assets remove --marker SO-UI` = clean),
theme restored to `Dark V 1.0`, lane stopped. Screenshots in `C:\dev\so-lanes\ui-review\design-system\`, named
`<viewport>-<theme>-<nn>-<surface>.png` with viewport `desktop` (1920x1080) or `mobile` (390x844) and theme:
- `dark`: ST `Dark V 1.0`, the owner's theme;
- `macaron`: `Celestial Macaron`, a second dark theme with a blue accent;
- `light`: a light palette set as inline `--SmartTheme*` overrides on `:root`. The install has no light theme: all five
  bundled themes are dark. The overrides are not saved and were removed afterwards.

Remote calls: none left the machine. Lane 35 is an offline lane (`offline-lane.json`): its server runs without plugins, so
there was no harness/opencode, judge or media route, and every loopback model URL points at the closed port 18079. The server
log for this session shows only refused local attempts: 6× `/completion`, 9× `/props`, 2× `/v1/models` to `127.0.0.1:18079`,
`ECONNREFUSED`. These are the story import firing model passes (living/critic/extraction) against the dead route. After the
coordinator's heads-up the lane copy's install-wide settings were switched off while the lane was stopped:
- `stagecraft.livingEnabled`, `curatorEnabled`, `prefetchEnabled` and `wardenEnabled`;
- `extraction.enabled`;
- `judge.enabled` and all 27 `judge.uses`;
- images and sprites.

The previous file is kept as `settings.json.pre-ds-review.bak`.

Note for the lead: `desktop-dark-05-ws-orch-library.png` and `mobile-dark-05-ws-orch-library.png` show the lane library's
story titles, some of them private. Do not attach them anywhere public.

Storybook was not started. `.storybook/st-theme.css` carries ST's default `:root` only, which is relevant to WP-7.

## 1. Inventory

### 1.1 Surfaces and their chrome (each one styles itself)

| Surface | Reached by | Container | Background | Radius | Shadow | Buttons used |
|---|---|---|---|---|---|---|
| Workspace `#so-workspace-modal` | top-bar route icon (1 click) | full-screen native dialog | **hard-coded `#202126`** + tint gradient | none | none | `st-button` + `menu_button` mixed |
| Studio `#so-studio-modal` | workspace › Orchestrator › Library › Author card (4+) | full-screen native dialog | translucent `--black30a` + blur (ST-like) | none | none | `st-button` (170 uses in `studio/`) |
| Briefing `dialog#so-briefing` | opens on its own before the first reply | centered dialog | `--SmartThemeBlurTintColor` | 12px | `0 0 24px` shadow colour | `menu_button` |
| HUD strip `#so-hud` | always above input | strip | tint 60% | 8px | none | custom `.so-hud-chip` |
| HUD card `#so-hud-card` | HUD (1) | popover | blur tint + blur | 0.5rem | `0 6px 24px` | `menu_button` 44px |
| Floating panels `#so-panels-root .so-panel` | HUD card / workspace launchers (2-3) | draggable window | blur tint | 8px | `0 6px 24px` | mixed |
| Story badge card `.so-story-card` | hover badge in ST lists | tooltip | blur tint | 6px | `0 4px 16px` | — |
| Inline chips `.so-inline-*` | under messages | inline | info 12% | 4px | none | custom chip |
| Help tooltip `.st-help-content` | `?` icon | popover | `--st-bg-active` | 0.5rem | `0 4px 16px` | — |
| Extensions stub `#story-orchestrator-settings` | ST Extensions drawer | row | none | none | none | `menu_button` |

Eight overlay surfaces, **six radii** for the same role (4px, 6px, 8px, 0.5rem, 12px, none), four different shadows, two
backdrop treatments (opaque vs blurred) for the two full-screen dialogs.

### 1.2 Component variants actually in use (grep over 203 non-story `.tsx`, plus CSS)

| Thing | Variants found | Detail |
|---|---|---|
| Button systems | **2 parallel** | ST `.menu_button` (182 uses, 68 files: settings, drawer, briefing, help, guide); our `.st-button` (216 uses, 60 files: studio, workspace). Both appear on the same workspace page (`04-ws-play`: "Show me" is `menu_button`, "Close" is `st-button`). |
| Button class strings | **41 distinct** | top: `menu_button` 107, `st-button secondary` 65, `st-button danger` 45, `st-button` 38, `st-button secondary self-start` 34, `menu_button text-xs` 22, `st-button primary` 17; plus one-offs with `px-2 py-0.5 text-[11px]`, `opacity-70`, `opacity-80`, `fa-solid fa-xmark` … |
| Button sizes | ≥5 | `st-button` = 12px text, `menu_button` = 15-16px, workspace forces `min-height: 44px` on every button (so 12px text in a 44px box: `04-ws-review` "Show author view", `06-author-tab-overview` "Suggest/Probe/Report"), HUD card 44px, `text-[10px]`/`text-[11px]` buttons in Studio. |
| Close / remove buttons | 4 | text glyph `×` (43), `fa-xmark` (4), `✕` (1), labelled "Close" `st-button` (workspace/Studio). |
| Tabs | **5 implementations** | Drawer tabs `menu_button` + `opacity-70` (`DrawerTabs.tsx:128`); Studio tasks `st-button secondary`+`st-tab-active` with `aria-current`; Studio sections `.st-tab` with roving tabindex + arrow keys (`StudioModal.tsx:211`, the only keyboard-correct one); Journal tabs `st-button`/`secondary` (`JournalPanel.tsx:60`); workspace context switch (`aria-pressed`) and side nav (`aria-current`) (`WorkspaceShell.tsx:109-117`). Only 3 use `role="tablist"`. |
| Disclosures | 47 `<details>` in 41 files | **18 distinct `<details>` class strings, 15 distinct `<summary>` class strings**; one `inline-drawer` (ST pattern); `Advanced` helper in `Field.tsx`; `.so-settings-section`; `.so-card-disclosure`. No shared component. |
| Toggles | 70 raw checkboxes, 0 `role="switch"` | checkbox label wrappers: 12 class strings (`flex items-center gap-2 text-sm` 27, `… text-xs` 8, `so-control-toggle` 3 …). `CheckRow` exists (`Field.tsx`) but most rows hand-roll. |
| Text inputs | 2 systems layered | `text_pole st-input` 103, bare `text_pole` 67, plus width variants (`w-16/20/24/36`, `min-h-[3rem]`, `min-h-[4rem]`, `min-h-[60px]`); workspace overrides every input/select background to **hard-coded `#292a30`** (`workspace.css:27`). |
| Selects | 129 `<select>` in 60 files | all native; enumerated values shown raw in places (`05-ws-orch-interface`: "Notes under replies" shows **`1`**). |
| Cards / panels | 7 | `.st-panel` (3), `.st-subpanel` (108), `.so-task-card` (9), `.so-feature-card` (workspace), `.so-help-panel`, `.so-hud-card`, `.so-panel`; plus ad-hoc `rounded border border-[var(--SmartThemeBorderColor)] p-2`. |
| Chips / badges | 5 | `.st-chip` (4), `.st-pill` (46), `.so-hud-chip`, `.so-inline-chip`, `.so-source-chip`. |
| Alerts / status | 5 | `FeedbackAlert` (2 files), `ActionStatus` (4 files), `.so-warning-text`/`.so-error-text`/`.so-success-text`, `.st-alert-*`, `.status-indicator` dots; plus `toastr` in runtime. |
| Empty states | ~35 literal strings, 0 component | "No proposals yet…", "Nothing written yet." etc., each a bare `<p>` with its own size/opacity. |
| Loading states | 3 patterns | `Lazy fallback={null}` (most lazy chunks show nothing), 7 bespoke "Loading …" strings, `aria-busy` spinner via a global CSS rule. |
| Typography | 4 sizes + 3 arbitrary | `text-xs` 499, `text-sm` 260, `text-base` 2, `text-lg` 1, `text-[11px]` 60, `text-[10px]` 28, `text-[12px]` 1; mount roots `@apply text-base` (16px) while ST body is `--mainFontSize` (15px × fontScale). |
| Muting | 5 opacity levels | `opacity-70` 191, `opacity-80` 119, `opacity-100` 60, `opacity-90` 10, `opacity-50` 1, plus `.st-muted` (0.75) 281 uses; `.st-muted-weak` defined, unused. |
| Spacing | Tailwind steps used ad hoc | gaps `2` 430, `1` 313, `3` 57, `0.5` 27; padding `p-2` 63, `px-2` 63, `p-3` 42, `py-0.5` 40, 20+ other combos. |
| Dividers | `border-white/10` 42 uses | hard-coded white, invisible on a light theme. |
| Icons | Font Awesome 6 (`fa-solid` 36, `fa-regular` 3), ~40 glyphs | used inconsistently: some buttons iconless, some icon-only (`menu_button fa-solid fa-trash-can`), `fa-fw` once. |
| Radii in CSS | 20 distinct values | see §1.1. z-index: 9 unrelated values (1…10000). |

### 1.3 Clicks to reach (design-system view: how much chrome sits between the user and a control)

| Task | Path | Clicks |
|---|---|---|
| Open journal | HUD › Open the journal | 2 |
| What could I do? | HUD › What could I do? | 2 |
| Close any overlay | Close / `×` / Escape (varies per surface) | 1 |
| Change a feature default | route icon › Orchestrator › Defaults › card › control | 5 |
| Change memory model | route icon › Orchestrator › Connections › select | 4 |
| Change notes level | route icon › Orchestrator › Interface › select (raw number) | 4 |
| Turn on Author view | route icon › Orchestrator › Library › Turn on Author view › confirm | 5 |
| Open Studio | route icon › Orchestrator › Library › Author card | 4+ |
| Switch Studio editor | task row › section row | 2 (two identical-looking button rows) |
| Ask a question | route icon › Orchestrator › Help › Help and Ask › type | 5 |

## 2. Findings (ranked)

### S1: blocks or breaks

**F1. Semantic colours do not exist; success, error, warning, info and hover all render as one colour.**
`src/styles.css:5-16` builds the token layer from six variables ST never defines: `--SmartThemeBodyActiveColor`,
`--SmartThemeActiveColor`, `--SmartThemeHoverColor`, `--SmartThemeSuccessColor`, `--SmartThemeErrorColor` and
`--SmartThemeWarningColor`. All six give 0 hits in ST `public/style.css`, `css/*` and `power-user.js`. Each chain falls back to
`--SmartThemeQuoteColor`. Measured in page on `Dark V 1.0`: `--st-success`, `--st-error`, `--st-warning`, `--st-info` and
`--st-hover` are all `rgb(198,193,151)`, and `--st-border` is `rgb(0,0,0)`. As a result:
- "Off on this install" and "Enabled" look identical (`desktop-dark-04-ws-story-features.png`);
- a blocking "Stops the story" row has the same colour as a neutral hint (`desktop-dark-04-ws-play.png`);
- the Author overview's `status-indicator` dots for Persona, Group, Lore and Extraction are all beige whether each is ok or
  failing (`desktop-dark-06-author-tab-overview.png`);
- `.st-button.danger` is not red;
- hover changes the border to the same quote colour.

Hurts readability and safety (destructive actions do not stand out), and status is unreadable at a glance.

**F2. The workspace ignores the ST theme: hard-coded dark colours make controls illegible on a light theme.**
`workspace.css:12` (`background-color: #202126`), `:17` (`#000b` backdrop), `:27` (`input, select { background-color: #292a30 }`)
and `studio/mobile.css:13` (graph sheet `#202126`). On a light palette the selects and the number input in Interface and the
search box in Features/Defaults become dark slabs with dark text, so the values cannot be read
(`desktop-light-05-ws-orch-interface.png`, `mobile-light-05-ws-orch-defaults.png`). On themed dark palettes the workspace stays
flat grey while every ST panel is translucent and blurred (`desktop-macaron-04-ws-story-features.png` vs
`desktop-dark-10-native-user-settings.png`). Plus 42 `border-white/10` dividers vanish on light themes. Hurts consistency with
ST, readability and theming.

**F3. The Extensions-drawer entry renders broken at every width.** `index.tsx:289` `SettingsRoot` puts `p-3 flex flex-col` on
the mount root itself. The Tailwind utilities are emitted nested under `:is(#story-orchestrator-settings, …)`, so they only
match descendants, never the root (measured: `flex-direction: row`, `padding: 0`). Combined with the global
`#story-orchestrator-settings .menu_button { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }` (`styles.css:443`)
and ST's centred `menu_button`, both buttons clip mid-word: "en Story Orchestra", "ry setup and rep"
(`desktop-dark-09b-our-settings.png`, `mobile-dark-09-ext-drawer.png`). It also sits as a bare row among ST's collapsible
`inline-drawer` neighbours. This is the first thing a user sees of us in ST's own UI. The same root-utility trap applies to
every mount root (`#so-hud-root`, `#so-panels-root`, …): gotchas.md already says "root element styling goes in an id rule",
but nothing enforces it.

### S2: hurts every screen

**F4. Two button systems, 41 class strings, at least 5 sizes, on the same page.** `menu_button` (ST, 15-16px, grayscale
filter) and `st-button` (ours, 12px `text-xs`, `py-1`) are mixed inside one workspace page. The workspace also forces 44px
height on all buttons, so `st-button` reads as tiny text in a big box (`desktop-dark-04-ws-review.png` "Show author view",
`desktop-dark-06-author-tab-memory.png` "Suggest / Probe / Report / Advance / Nudge"). There is no primary/secondary hierarchy
a user can see: `.primary` only tints the border with the (broken, F1) info colour, so "Save" and "Save As" in the Studio
footer look the same as "Export JSON" (`desktop-dark-07-studio.png`). Files: `styles.css:165-204`, `workspace.css:26`,
`studio/mobile.css:22`, every caller.

**F5. Five tab implementations, one keyboard-correct.** See §1.2. Drawer tabs mark the active tab only by *removing*
`opacity-70` from the others. Studio stacks two rows of identical bordered pills (tasks vs sections) with no visual hierarchy
(`desktop-dark-07-studio-state-and-rules.png`). On mobile the Author tabs wrap to two lines (`mobile-dark-06-author-tab-overview.png`)
and the Studio task row shows a raw scrollbar (`mobile-dark-07-studio-state-and-rules.png`). Only `StudioModal` implements
arrow/Home/End and roving tabindex.

**F6. Disclosure soup: 18 `<details>` styles and 15 `<summary>` styles, no component.** Native triangles in different
sizes and weights, some summaries muted, some bold, some 12px (`desktop-dark-05-ws-orch-connections.png`: "Memory —…",
"Advanced", "World —…", "Images —…" at three different weights). Lone `?` buttons float on their own rows between sections
(`05-ws-orch-connections`, the two empty bordered squares under "Chapters" and "World"). This is the visual root of the owner's
"too many accordions" complaint: even where the settings reviewer keeps a disclosure, it does not look like one control.

**F7. Typography is mostly 12px and smaller, with no scale.** 499 `text-xs` plus 89 arbitrary `text-[10px]`/`[11px]` against
260 `text-sm`. The Author overview is almost entirely 12px label/value stacks with no hierarchy
(`desktop-dark-06-author-tab-overview.png`). Studio help lines under fields are 11px (`desktop-dark-07-studio-state-and-rules.png`).
Section titles (`h2` 1.25rem in the workspace, `so-card-heading` 1rem, `font-semibold` 12px labels) do not form a scale. Muting
is expressed five ways (§1.2), so "secondary text" has no single look. Note: the 1rem-regardless-of-Font-Scale rule is an owner
decision (gotchas.md) and is kept; the problem is the sizes below it.

**F8. Raw browser defaults leak through.**
- `<fieldset>` with the UA white groove border, "Note categories" (`desktop-dark-05-ws-orch-interface.png`).
- List bullets remain on the Studio quality list next to bordered buttons (`desktop-dark-07-studio-state-and-rules.png`).
- The features search box has no placeholder, icon or radius and renders as a heavy bar (`04-ws-story-features`).
- Selects stretch to full width for one-digit values.
- An enum is shown as its raw number ("Notes under replies: 1").
- A "Default" pill sits on every Interface row, competing with the control.

**F9. Surfaces disagree on what a container is.** §1.1: two full-screen dialogs with opposite backdrops, six radii, four
shadows, seven card classes. The Help panel shows **two headers with two close buttons** ("Help ×" from `PanelFrame` plus "Help ×"
from the inner help panel; `desktop-dark-11-help-panel.png`, `mobile-dark-03-hud-card.png`). Workspace content is centred at
`max-width: 72rem` next to a 13rem nav, so at 1920 there is a ~270px dead gutter between nav and content (`04-ws-*`).

**F10. No shared empty, loading or error states.** About 35 hand-written "No … yet" lines in assorted sizes. Most lazy chunks
render `fallback={null}`, so a panel is blank until its chunk arrives. Failures show as an inline 12px red line
(`Lazy.tsx` `LAZY_FAILED_TEXT`). Hurts perceived quality and makes "empty" indistinguishable from "broken".

### S3: polish and robustness

**F11. Global CSS leaks out of the mount-root scope.** `styles.css:1150` styles `button[aria-busy="true"]::after` page-wide,
which affects any ST or extension button that sets `aria-busy`. `.so-media-pending` and `.so-sprite-pending` are unscoped too.
The `--st-*` tokens live on global `:root` under a generic prefix (collision risk with other extensions).

**F12. Focus visibility is uneven.** Only `.st-button`, `.st-help-icon`, `.so-panel-bar` and `.so-story-badge` define
`:focus-visible`. Workspace nav and context buttons, `.st-tab`, `.so-feature-card`, `.so-hud-chip` and the inline chips rely on
the UA ring or nothing. `.st-input:focus { outline: none }` replaces the ring with a border colour that is the broken `--st-hover`
(F1), so input focus is nearly invisible. Only 9 `aria-expanded` and 12 `aria-pressed` across 47 disclosures and many toggles.

**F13. Icons are ad hoc.** Font Awesome is right (ST uses it), but there are four close-button styles, icon-only buttons
without a fixed width, emoji-free but glyph-heavy text (`×` 43 times). Repair rows and status lines carry no icon, which
matters more because colour is broken (F1).

**F14. Motion is inconsistent but small.** Game-layer animations respect `prefers-reduced-motion` and `data-motion`. The busy
spinner respects reduced motion. The workspace and Studio have no open/close transition while ST drawers animate
(`--animation-duration`), so our dialogs pop. `studio/mobile.css:31` zeroes transitions for reduced motion; nothing honours ST's
own "Reduced Motion" setting (`body.reduced-motion`).

## 3. Proposal

Goal: **look native to ST, but tidier.** Use ST's own tokens (`--SmartTheme*`, `--mainFontFamily`, `--animation-duration`,
`--black30a`) as the only colour source, derive what ST lacks (semantic colours, elevation, radius) once, and ship one small
component kit that every surface uses. No new colour literals outside the token file.

### 3.1 Token set (`src/styles/tokens.css`, scoped to mount roots plus `dialog[id^="so-"]`)

```css
:is(#so-workspace-modal, #so-studio-modal, #so-briefing, #so-hud-root, #so-panels-root,
    #drawer-manager, #story-orchestrator-settings, .so-inline-host, .so-story-card) {
  /* colour: only from ST */
  --so-fg:        var(--SmartThemeBodyColor);
  --so-fg-muted:  color-mix(in srgb, var(--SmartThemeBodyColor) 72%, transparent);
  --so-fg-subtle: var(--SmartThemeEmColor);
  --so-accent:    var(--SmartThemeQuoteColor);            /* the one accent, ST's own */
  --so-link:      var(--SmartThemeUnderlineColor);
  --so-surface:   var(--SmartThemeBlurTintColor);          /* dialogs, panels */
  --so-surface-2: color-mix(in srgb, var(--SmartThemeBodyColor) 5%, var(--SmartThemeBlurTintColor));  /* cards */
  --so-surface-3: color-mix(in srgb, var(--SmartThemeBodyColor) 9%, var(--SmartThemeBlurTintColor));  /* hover, selected */
  --so-field:     var(--black30a);                         /* same as ST .text_pole */
  --so-line:      color-mix(in srgb, var(--SmartThemeBodyColor) 14%, transparent);  /* works on light + dark */
  --so-line-strong: var(--SmartThemeBorderColor);
  --so-blur:      var(--SmartThemeBlurStrength);
  --so-shadow:    var(--SmartThemeShadowColor);
  /* semantic: ST has none, so fixed hues mixed toward the theme's text colour (readable on light and dark) */
  --so-ok:    color-mix(in oklab, #3fae6a 70%, var(--SmartThemeBodyColor));
  --so-warn:  color-mix(in oklab, #d9a23a 70%, var(--SmartThemeBodyColor));
  --so-error: color-mix(in oklab, #e0524d 70%, var(--SmartThemeBodyColor));
  --so-info:  var(--SmartThemeQuoteColor);
  /* shape, space, type, motion */
  --so-radius-sm: 4px; --so-radius: 8px; --so-radius-lg: 12px; --so-radius-pill: 999px;
  --so-space-1: 4px; --so-space-2: 8px; --so-space-3: 12px; --so-space-4: 16px; --so-space-6: 24px;
  --so-text-xs: 0.8125rem; --so-text-sm: 0.875rem; --so-text: 1rem; --so-text-lg: 1.125rem; --so-text-xl: 1.375rem;
  --so-control-h: 2.25rem;            /* 36px desktop */
  --so-dur: var(--animation-duration, 125ms);
  --so-z-popover: 3600; --so-z-panel: 3500; --so-z-dialog: 4100;
}
@media (pointer: coarse), (max-width: 699px) { :is(...) { --so-control-h: 2.75rem; } }  /* 44px touch */
body.reduced-motion :is(...) { --so-dur: 0ms; }
```

Rules: 12px (`--so-text-xs` = 13px) is the floor; no `text-[10px]`/`[11px]`. One muted colour (`--so-fg-muted`) replaces the five
opacity levels. Elevation uses `--so-shadow` only. A `codeHealth`-style guard fails on a hex/rgb literal or `border-white/*` in
`src/**/*.css|tsx` outside `tokens.css` and the game accent table.

### 3.2 Component kit (`src/components/ui/`, each with `.stories.tsx`; tiny, main bundle)

| Component | Replaces | Notes |
|---|---|---|
| `Button` (`variant: primary \| secondary \| ghost \| danger`, `size: sm \| md`, `icon?`, `busy?`) | `menu_button`/`st-button` mix, 41 strings, `BusyButton` | renders `.so-btn`; `busy` folds in `BusyButton` + `aria-busy`; icon-only requires `label` (aria). Keeps `menu_button` class **inside the Extensions drawer only**, where ST look-alike is the point. |
| `IconButton` | `×` glyphs, `menu_button fa-solid fa-xmark` | fixed 2.25rem square, FA icon, tooltip = label |
| `Tabs` / `TabList` / `Tab` (`variant: underline \| segmented`) | 5 tab implementations | roving tabindex + arrows/Home/End (lift from `StudioModal.tsx:195`), `aria-selected`, overflow scrolls with fade edges instead of a scrollbar |
| `NavList` (vertical, with optional count/badge, collapses to bottom bar or a select on mobile) | workspace nav, Studio task row | `aria-current="page"` |
| `SegmentedControl` | small enums shown as selects (notes level, inline level, accept mode `review/auto/off`) | radio group semantics, shows labels instead of raw numbers |
| `Switch` (`role="switch"`) | 70 raw checkboxes for on/off settings | checkboxes stay for multi-select lists |
| `SettingRow` (`label`, `description`, `control`, `source?`, `onReset?`, `help?`) | `CheckRow`, `FieldLabel`, `.so-control-row`, hand-rolled rows | the one row: label + one-line description on the left, control on the right (stacked under 700px); "set by story / this chat / default" as a small `Badge`; reset as a ghost icon button that appears only when the value differs |
| `Section` (title, description, optional `collapsible` that is **off by default**) | 18 `<details>` styles, `Advanced`, `.so-settings-section` | when collapsible, one chevron style and `aria-expanded`; `Advanced` becomes `Section collapsible title="Advanced"` |
| `Card` (`interactive?`, `selected?`, `tone?`) | `.st-panel`, `.st-subpanel`, `.so-task-card`, `.so-feature-card` | interactive cards get a chevron + hover + focus ring |
| `Badge` / `Chip` (`tone: neutral \| info \| ok \| warn \| error`) | `.st-chip`, `.st-pill`, `.so-source-chip`, status text colours | text + icon, never colour alone |
| `Callout` (`tone`, `title`, `actions`) | `FeedbackAlert`, `.st-alert-*`, Repair rows, `so-warning-text` lines | left rule + icon + tone tint |
| `StatusDot` | `.status-indicator` | tone-correct, with text label |
| `Toolbar` (start/end slots, sticky footer variant) | Studio footer, author driver rows | groups primary actions right, secondary left |
| `EmptyState` (`icon`, `title`, `body`, `action?`) | ~35 literal lines | one size, muted, optional action |
| `Skeleton` / `Loading` | `fallback={null}`, 7 "Loading…" strings | used as the `Lazy` default fallback |
| `Sheet` / `Dialog` (native `<dialog>` + `showModal()`) | workspace/Studio/briefing/panel chrome | one header (title, subtitle, close `IconButton`), one backdrop (ST blur), radius `--so-radius-lg` when not full-screen; `PanelFrame` uses the same header so the Help double-header disappears |
| `SearchField` | features search, guide search | icon, placeholder, clear button |
| `Field` (input/select/textarea wrapper) | `text_pole st-input` + width hacks | inherits `.text_pole` look via tokens; `size` prop instead of `w-16/20/24` |

### 3.3 Before/after sketches

Buttons (today a page mixes all of these, F4):

```
before:  [Show me]  [ I know, keep it ]  [Close]   [Suggest] [Probe]     <- 3 heights, 2 fonts, no hierarchy
after:   ( Show me )  [ Keep it ]  [ Close ]                              <- primary = accent fill, secondary = line, ghost = text
         ( Save )  [ Save as ]  [ Export ]   ·····   [ Reset draft ]      <- Toolbar: primary right, destructive apart
```

Setting row (today: label above, full-width select, "Default" pill, `?` on its own line):

```
before:
  Notes under replies
  [1                                                    v]  (Default)
after:
  Notes under replies                          [ Off | Story | Behind | Author | Raw ]
  What appears under each reply.  set by: default                              (reset)
```

Tabs (today Studio: two identical pill rows):

```
before:  [Story setup] [Flow] [State and rules] [Characters] ...
         [Qualities] [Game] [Story rules]
after:   Story setup   Flow   State and rules   Characters   World ...     <- NavList (left rail on desktop)
         ───────────────────────────────────
         Qualities · Game · Story rules                                     <- Tabs variant=underline
         ━━━━━━━━━
```

Status (today all beige, F1):

```
before:  ● Persona  ● Group  ● Lore  ● Extraction          (all same colour)
after:   ✓ Persona   ✓ Group   ! Lore: 1 book missing   ✕ Extraction off  [Fix]
         (ok)        (ok)      (warn)                   (error)
```

Dialog chrome (workspace, Studio, panels share one header):

```
desktop                                                        mobile (390)
┌──────────────────────────────────────────────────────────┐   ┌───────────────────────────┐
│ SO-UI Factions lab · This chat · Player view        [ ✕ ]│   │ ‹  Features          [ ✕ ]│
├────────────┬─────────────────────────────────────────────┤   ├───────────────────────────┤
│ THIS STORY │ Features                    [🔍 Find…     ] │   │ [🔍 Find a setting…      ]│
│ ▸ Play     │ ┌ Memory ───────────────────────────────┐   │   │ Memory                    │
│   Features │ │ Story reading              [  ●○ ]  > │   │   │ Story reading      [ ●○ ] │
│   Review   │ │ Reads replies to track facts.  Off ·  │   │   │ Reads replies…  Off·inst. │
│ ORCHESTR.  │ │ Prompt memory              [ ○● ]  >  │   │   │ Prompt memory      [ ○● ] │
│   Library  │ └───────────────────────────────────────┘   │   │ ...                       │
│   Defaults │                                             │   ├───────────────────────────┤
│   …        │                                             │   │ Play  Features  Review  ⋯ │
└────────────┴─────────────────────────────────────────────┘   └───────────────────────────┘
backdrop: ST blur + --so-surface (translucent, follows theme), radius 0 full-screen, --so-radius-lg if windowed
```

(The information architecture is the settings, player and author reviewers' call; this is only the shared chrome. Note the
context switch "This story / Orchestrator" can become nav-group headings, which drops one row of chrome on mobile.)

HTML snippet of the kit on tokens (drop into Storybook to judge on any theme):

```html
<div id="so-panels-root">
  <section class="so-card">
    <header class="so-card-head"><h3 class="so-h3">Memory</h3><span class="so-badge" data-tone="ok">
      <i class="fa-solid fa-check"></i> On</span></header>
    <div class="so-setting">
      <div><label for="x" class="so-setting-label">Story reading</label>
        <p class="so-setting-desc">Reads replies to track facts and story progress.</p></div>
      <button id="x" role="switch" aria-checked="false" class="so-switch"></button>
    </div>
    <div class="so-callout" data-tone="warn"><i class="fa-solid fa-triangle-exclamation"></i>
      <p>The memory model is not answering. The story catches up when it does.</p>
      <div class="so-actions"><button class="so-btn" data-variant="primary">Show me</button>
        <button class="so-btn" data-variant="ghost">Keep it</button></div></div>
  </section>
</div>
<style>
.so-card{background:var(--so-surface-2);border:1px solid var(--so-line);border-radius:var(--so-radius);padding:var(--so-space-4)}
.so-setting{display:flex;justify-content:space-between;gap:var(--so-space-4);padding:var(--so-space-3) 0;border-top:1px solid var(--so-line)}
.so-setting-desc{margin:0;color:var(--so-fg-muted);font-size:var(--so-text-sm)}
.so-btn{min-height:var(--so-control-h);padding:0 var(--so-space-3);border-radius:var(--so-radius-sm);font:inherit;font-size:var(--so-text-sm);
  color:var(--so-fg);background:transparent;border:1px solid var(--so-line-strong);transition:background var(--so-dur)}
.so-btn[data-variant=primary]{background:color-mix(in srgb,var(--so-accent) 22%,var(--so-surface));border-color:var(--so-accent)}
.so-btn[data-variant=ghost]{border-color:transparent}
.so-btn[data-variant=danger]{color:var(--so-error);border-color:color-mix(in srgb,var(--so-error) 50%,var(--so-line))}
.so-btn:hover{background:var(--so-surface-3)}
:is(.so-btn,.so-switch,[role=tab]):focus-visible{outline:2px solid var(--so-accent);outline-offset:2px}
.so-switch{width:2.5rem;height:1.375rem;border-radius:var(--so-radius-pill);background:var(--so-field);border:1px solid var(--so-line-strong);position:relative}
.so-switch::after{content:"";position:absolute;inset:2px auto 2px 2px;aspect-ratio:1;border-radius:50%;background:var(--so-fg-muted);transition:transform var(--so-dur)}
.so-switch[aria-checked=true]{background:color-mix(in srgb,var(--so-accent) 45%,var(--so-field))}
.so-switch[aria-checked=true]::after{transform:translateX(1.1rem);background:var(--so-fg)}
.so-badge{display:inline-flex;gap:4px;align-items:center;padding:0 8px;border-radius:var(--so-radius-pill);font-size:var(--so-text-xs);
  color:var(--tone);background:color-mix(in srgb,var(--tone) 14%,transparent)}
[data-tone=ok]{--tone:var(--so-ok)} [data-tone=warn]{--tone:var(--so-warn)} [data-tone=error]{--tone:var(--so-error)} [data-tone=info]{--tone:var(--so-info)}
.so-callout{display:grid;grid-template-columns:auto 1fr;gap:var(--so-space-2) var(--so-space-3);padding:var(--so-space-3);border-left:3px solid var(--tone);
  background:color-mix(in srgb,var(--tone) 9%,transparent);border-radius:var(--so-radius-sm)}
</style>
```

### 3.4 What merges, moves, gets deleted

- **Delete**:
  - the fake `--st-*` fallback chains (`styles.css:4-17`);
  - `.st-bg-active`, `.st-bg-hover`, `.st-text-active`, `.st-strong`, `.st-muted-weak` (unused);
  - `.st-panel` and `.st-panel-header` (3 uses);
  - `.st-chip`, `.st-pill`, `.st-tab*` and `.st-alert-*`, folded into the kit;
  - `workspace.css` colour literals; the `border-white/10` utilities;
  - `FeedbackAlert` (merged into `Callout`) and `Toolbar.tsx` (becomes a Studio-specific use of the kit `Toolbar`).
- **Split** `styles.css` (1,170 lines) into:
  - `styles/tokens.css`;
  - `styles/kit.css` (component classes);
  - per-surface files that already partly exist (`hud.css`, `panels.css`, `briefing.css`, `game.css`, `guide.css`), so a
    surface's CSS ships with its lazy chunk where it can.
- **Merge** the dialog chrome of workspace, Studio, briefing and `PanelFrame` into `Dialog`/`Sheet`.
- **Move** the global `button[aria-busy]` spinner into `.so-btn[aria-busy]`, and scope `.so-media-pending` and
  `.so-sprite-pending`.
- **Keep**:
  - native `<dialog>`;
  - the mount-root scope;
  - the 1rem base (owner rule);
  - Font Awesome;
  - the game accent table (`data-accent`, authored, intentionally fixed);
  - `.so-story-badge` as the only out-of-root rule.
- **Root-utility rule**: mount-root elements never carry Tailwind utilities. A guard test fails on
  `id="(story-orchestrator-settings|so-hud-root|so-panels-root|…)"` with a `className` that holds a utility (F3).

### 3.5 Selectors that change (harness must follow)

Ids and `data-so` attributes do **not** change in this area. Class-level changes the harness or tests read:

| Selector | Used by | Change |
|---|---|---|
| `.st-pill` (repair row code) | `scripts/debug/so-ui.mts:766` | becomes `.so-badge`; switch the read to a `data-so="repair-code"` attribute added in WP-3 |
| `.menu_button` inside dialogs | `scripts/debug/lib/authorSlash.mts:20`, `st-actions.mts:136` | these read **ST popups** (`callGenericPopup`), which keep ST's `.menu_button`, so no change, as long as the chapter-jump confirm stays an ST popup |
| `.so-feature-card` | `BriefingModal.stories.tsx` | becomes `.so-card[data-interactive]`; the story updates |
| `#drawer-manager [role="tablist"] button` (gotchas.md, `so-ui drawer-tab`) | `so-ui.mts` | unchanged: the kit `Tabs` keeps `role="tablist"`/`role="tab"`; `a11y.js` `role="button"` rewrite no longer applies once tabs stop using `.menu_button` |
| `.so-control-row`, `.so-control-toggle` | workspace CSS only | become `SettingRow` (`data-so="setting-row"` added) |
| Settings checkboxes "click `box.closest('label')`" (debug-scripts.md) | `so-scenario` `ui` actions | the `Switch` is a `button[role=switch]`; the harness helper that toggles a setting needs a `role=switch` branch (WP-4) |
| `.so-settings-section > summary` | `styles.css` only | removed with `Section` |

## 4. Work packages

Order: WP-1 first, since it fixes F1-F3 and nothing visible depends on the kit. WP-2 is then the base for all others. WP-3 to WP-6
can run in parallel and are what the other area reviewers' IA work builds on.

| WP | Size | What | Depends | Risk | Touches |
|---|---|---|---|---|---|
| **WP-1 Token fix** | S | `tokens.css` with real ST variables and derived semantic colours; re-point `--st-*` to it (no caller change); remove the `workspace.css`/`studio/mobile.css` literals; replace `border-white/10` with `--so-line`; fix the `SettingsRoot` root-utility bug (id rule) and drop the `nowrap/ellipsis` override for `#story-orchestrator-settings`; scope the busy spinner; add the root-utility and colour-literal guard tests | — | low; visible change is colour only | `styles.css`, `workspace.css`, `studio/mobile.css`, `index.tsx`, 42 files with `border-white/10`, `codeHealth.guard.test.ts` (or a new `styleTokens.guard.test.ts`); Storybook snapshots/axe re-run |
| **WP-2 Kit core** | M | `components/ui/`: `Button`, `IconButton`, `Badge`, `Callout`, `StatusDot`, `EmptyState`, `Skeleton`, `Field`, `SearchField` + `kit.css`; `Lazy` default fallback → `Skeleton`; stories for each with a theme toolbar (dark default, light, Celestial Macaron) in `.storybook/preview.ts` | WP-1 | low; additive, ~4-6 KB main | new `src/components/ui/*`, `.storybook/preview.ts`, `st-theme.css` (+ light variable set), `Lazy.tsx` |
| **WP-3 Buttons and alerts migration** | M | replace `menu_button`/`st-button` in our surfaces (not the Extensions drawer stub) and `FeedbackAlert`/`ActionStatus`/`so-*-text`/`.st-alert-*` with the kit; `×` → `IconButton`; add `data-so="repair-code"` | WP-2 | medium; wide diff (~120 files), mechanical; harness `.st-pill` read | all callers, `so-ui.mts:766`, affected stories |
| **WP-4 Controls** | M | `Switch`, `SegmentedControl`, `SettingRow`, `Section`; adopt in `Field.tsx` (`CheckRow` → `SettingRow`+`Switch`, `Advanced` → `Section`) so every settings caller upgrades at once; enum selects with ≤5 options → `SegmentedControl` | WP-2 | medium; settings harness toggles | `components/settings/Field.tsx`, `workspace/FeaturePolicyFields.tsx`, `DevicePreferences.tsx`, `scripts/debug` setting-toggle helper (`role=switch` branch), scenario `ui` action docs |
| **WP-5 Navigation primitives** | M | `Tabs` (from `StudioModal` keyboard logic), `NavList`; migrate the drawer tabs, Studio tasks and sections, journal tabs, workspace nav and context | WP-2 | medium; `drawer-tab` / `studio-tab` harness verbs; mobile layouts | `DrawerTabs.tsx`, `StudioModal.tsx`, `JournalPanel.tsx`, `WorkspaceShell.tsx`, `workspace.css`, `studio/mobile.css`, `so-ui.mts` drawer/studio verbs |
| **WP-6 Dialog/Sheet chrome** | M | one `Dialog`/`Sheet` header + backdrop (ST blur, translucent, theme-following) for workspace, Studio, briefing, `PanelFrame`; remove the inner Help header; open/close transition on `--so-dur`, honour `body.reduced-motion`; radii/shadows/z from tokens | WP-1, WP-2 | medium; native `<dialog>` and `translateZ` traps (gotchas.md); the mobile `dockInset` logic must survive | `WorkspaceShell.tsx`, `StudioModal.tsx`, `BriefingModal`, `PanelFrame.tsx`, help panel, `styles.css` surface rules |
| **WP-7 CSS split and lazy styles** | S | split `styles.css` into tokens/kit/per-surface; move surface CSS into its lazy chunk where the surface is lazy; check the main bundle stays under 1,300,000 B | WP-3..6 | low | `styles.css`, `webpack.config.js` (no budget change), `buildChecks.mjs` |

Each WP closes with `npm run gates` (Storybook included; the kit adds stories). The live check per WP is a screenshot pass on a
lane in `Dark V 1.0` plus one light palette and mobile 390x844, comparing against the `*-dark-*` and `*-light-*` baselines here.

## 5. Open questions for the owner

1. **Accent:** follow each theme's Quote colour (fully native; on `Dark V 1.0` that is beige/olive), or a fixed Story Orchestrator
   accent mixed into the theme?
2. **Dialogs:** translucent and blurred like ST's drawers (follows the background art), or opaque for readability over busy
   backgrounds? WP-6 can offer a device preference.
3. **Density:** compact (36px controls on desktop, ST-like) or comfortable (44px everywhere as the workspace does today)?
4. **Switches vs checkboxes:** iOS-style switches for on/off settings (modern), or keep ST-style checkboxes for a native look?
5. **Should the Extensions-drawer entry become a proper ST `inline-drawer`** with a short status and the two launch buttons
   (consistent with its neighbours), or stay a minimal two-button card?
