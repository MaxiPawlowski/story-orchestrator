# SillyTavern UI: DOM selectors, CSS injection, UI gotchas

Scope: a map of SillyTavern's front-end DOM for extension developers and test authors. It covers the stable ids and classes of the page skeleton, top bar and drawers, chat messages, send form and Quick Reply bar, character list, VN/waifu mode and expressions, and backgrounds. It also covers where CSS can be injected and in what cascade order, the hooks for per-character and per-state styling, community CSS habits that break the UI (and how to recover), and how all of this collides with Story Orchestrator's own mounts. Distilled from the community "Custom CSS snippet compilation" thread plus two smaller guides, then checked against the ST source tree.

**Read this when** you are: writing a selector in `src/` or `scripts/debug/*` that touches ST's DOM, mounting new UI into ST, debugging "our panel looks wrong / disappeared" on a user's install, styling something per character or per state, or deciding where a CSS change should live.

Conventions:
- `(verified: path:line)` paths are relative to the ST root `C:\dev\SillyTavern-MainBranch` (ST 1.19.0, commit `7c3994196`, 2026-09-14). `src/…`, `scripts/debug/…` and `dist/…` with no `public/` prefix are **our** extension paths.
- `(verified live)` means the check ran in the running ST on 2026-09-18 through `node scripts/debug/st-eval.mts`.
- `(community-reported, yyyy-mm)` means not checkable in core source, usually because it concerns a third-party extension. Where the post month is unknown, the thread's active span is given instead.
- Snippets are representative. Pure taste theming (fonts, gradients, model-name lists, icon packs) was dropped; the source thread and its GitHub mirror (see Sources) have the full set.

Related: `.claude/skills/st-scripting/` covers the regex-script JSON format, placement and `markdownOnly`. `.claude/skills/st-image-generation/` covers `/bg`, sprites and regex-inserted illustrations as techniques. `.claude/rules/gotchas.md` holds the project's ST DOM gotchas; this doc links to those instead of repeating them.

---

## 1. Where CSS can go, and who wins

### 1.1 Injection points

| Where | How it lands in the page | Notes |
|---|---|---|
| **User Settings → Custom CSS** (`#customCSS` in `#CustomCSS-block`) | `power_user.custom_css` is written into `<style id="custom-style">`, which is appended to `<head>` (verified: `public/scripts/power-user.js:1147-1158`) | Re-applied on every keystroke, so no reload is needed (verified: `public/scripts/power-user.js:3351-3355`). Persisted as `power_user.custom_css` in `data/<user>/settings.json` (verified: `public/script.js:8084`, `src/endpoints/settings.js:208`). |
| **Themes** (`data/<user>/themes/<name>.json`) | Every theme carries a `custom_css` key, and applying a theme overwrites the box whenever the key is present (verified: `public/scripts/power-user.js:1252-1256,1427-1438`) | The bundled themes ship `"custom_css": ""` (verified: `default/content/themes/Azure.json:32`), so `/theme Azure` **wipes** your Custom CSS. Importing a theme whose CSS contains `@import` raises a confirm popup (verified: `public/scripts/power-user.js:2459-2465`). |
| **`user.css`** | `<link href="css/user.css">`, the last core stylesheet in `index.html` and also loaded on `login.html` (verified: `public/index.html:46`, `public/login.html:33`) | The file **moved** to `<DATA_ROOT>/_css/user.css` (default `data/_css/user.css`) and is served at `/css/user.css` (verified: `src/middleware/userCss.js:9-10`). An old `public/css/user.css` is auto-migrated (verified: `src/users.js:510-511`). It is shared by **all** users, and it is the only place the **login screen** can be styled, because Custom CSS is not loaded before login. |
| **Creator's Notes `<style>`** (per card) | Rendered inside `#creator_notes_spoiler` (verified: `public/index.html:6150`) | See §1.3: now gated by a popup, and class names are rewritten. |
| **`<style>` inside a chat message** (LLM output, regex Replace With, `/sendas` …) | Encoded, sanitized and re-emitted scoped under `.mes_text` (verified: `public/script.js:1966-1968`) | See §1.3. |
| **CSS Snippets extension** (LenAnderson, third-party) | Its own style element | Snippets can be global or scoped to a theme, characters or groups (export fields `isGlobal`, `themeList`, `charList`, `groupList`) (community-reported, 2025-05). `@import` works only in the main Custom CSS box, not inside snippets (community-reported, CSS thread 2024-04..2026-05). This is also standard CSS: `@import` must come before every other rule in its sheet. |
| **Extension stylesheets** | `manifest.css` becomes a `<link id="<name>-css">` appended to `<head>` when the extension loads (verified: `public/scripts/extensions.js:781-803`). Bundlers using style-loader (ours) inject a `<style>` element | Appended **after** `#custom-style` (see §1.2). |

### 1.2 Cascade order (verified live)

The live `<head>` tail on 2026-09-18 read: core links … `css/mobile-styles.css`, `css/macros.css`, `css/user.css`, SVGInject `<style>`, **`#custom-style`**, `connection-manager-css`, `regex-css`, **our tailwind `<style>`**, other third-party extension CSS, `memory-css`, `stable-diffusion-css`. What that order means:

- **Custom CSS beats core ST and `user.css`** when specificity is equal, because it comes later.
- **Extension CSS beats Custom CSS** when specificity is equal, because extensions load after settings. To restyle an extension from Custom CSS, add specificity (`html > body …` is the community habit) or use `!important`.
- **Core ST uses `!important` in places you will want to override.** `.hidden { visibility: hidden !important }` (verified: `public/style.css:241-244`), `.lastInContext` border (verified: `public/style.css:5971-5973`), `.last_mes { margin-bottom: 0 !important }` (verified: `public/style.css:1217-1220`), and every `display: none !important` in document style (verified: `public/css/toggle-dependent.css:355-360`). Matching them requires `!important` too.
- **Story Orchestrator's CSS is scoped to its mount roots with exactly one ID** (since 2026-09-19). Every rule is `#drawer-manager …`, `#so-hud-root …`, `#story-orchestrator-settings …`, `#so-studio-root …` or `#so-studio-modal …`, or an id rule such as `#so-hud .so-hud-chip`. Our style tag loads after `#custom-style`, so a Custom CSS rule at equal specificity loses. One more class or element than ours, for example `body #drawer-manager .st-button`, wins **without `!important`**. Until 2026-09-19 postcss-preset-env polyfilled tailwind's cascade layers as `:not(#\#)` chains (+2 to +4 IDs), which forced `!important`. History and the ST-side effects are in §7.2.
- **Mobile layout is chosen by width, not by device.** `public/css/mobile-styles.css` is one `@media screen and (max-width: 1000px)` block (verified: `public/css/mobile-styles.css:1-2`), and community snippets wrap their mobile overrides in the same query. JS `isMobile()` looks at the **user agent** (mobile/tablet) instead (verified: `public/scripts/RossAscends-mods.js:143-147`). So a desktop browser narrowed to 390px gets mobile CSS but desktop JS branches, for example group VN mode (§2.7).

### 1.3 HTML/CSS inside messages and Creator's Notes: the sanitizer rules

Messages go through this pipeline (verified: `public/script.js:1800-1970`): regex scripts run first (`getRegexedString`, line 1860). Then `encode_tags` runs: if **User Settings → "Show <tags> in responses"** is ON, `<` is escaped for non-system messages, so HTML **and regex-inserted HTML** render as text (verified: `public/script.js:1875`, `public/scripts/power-user.js:301` default `false`, `public/index.html:5451-5453`). Then quotes are wrapped in `<q>` (line 1905), then markdown, then DOMPurify, then the style decode.
- **Classes are prefixed `custom-`.** Every class in message or notes HTML becomes `custom-<name>`, except classes starting with `fa-` or `note-` and the class `monospace` (verified: `public/scripts/chats.js:1914-1932`). So `class="char-info"` renders as `.custom-char-info`. Write global Custom CSS against the prefixed name, and do not type the prefix into the Replace With yourself.
- **`<style>` in a message works, scoped.** Each selector gets the prefix `.mes_text `, and class selectors inside it are rewritten `.x` → `.custom-x` to match. `@import` rules are dropped. Declarations containing `://` are stripped unless external media is allowed (verified: `public/scripts/chats.js:536-620`). A style block in a message therefore can only reach that message's content, never ST's UI. This **supersedes** the Feb 2025 guide's claim that regex Replace With "does not support inline `<style>`". The community skill-check regex (Apr 2025) ships a `<style>` block and works.
- **Creator's Notes `<style>`.** When a solo chat opens with a card whose notes contain `<style>`, ST asks **"Just to Creator's Notes"** or **"Apply to the entire app"** once per card. The answer is stored as `AllowGlobalStyles-<avatar>` in account storage and can be changed later with the palette button `#creators_note_styles_button` (verified: `public/scripts/chats.js:631-676,747-787`, `public/index.html:6142`). "Just to notes" prefixes selectors with `#creator_notes_spoiler `. "Entire app" adds no prefix, **but class selectors are still rewritten to `custom-…`** (verified: `public/scripts/chats.js:560,584-595,684-703`). So app-wide card CSS can only target ST by **id, element and attribute** selectors (`#chat`, `#sheld`, `body`, `[ch_name="X"]`), never by ST class names (`.mes`, `.mes_text`). The 2025 community recipe "wrap CSS in `<style>` in Creator's Notes, it auto-applies while the card is open" predates this gate.

---

## 2. DOM map

### 2.1 Page skeleton

```
body                       (state classes: §2.10; data-generating / data-swiping: §3)
├─ #bg1                    background layer (the only one; §2.6)
├─ #top-bar                empty bar behind the icons
├─ #top-settings-holder    the icon row; each child is .drawer (§2.2)
├─ #movingDivs             floating panels: #floatingPrompt (Author's Note), #cfgConfig, #logprobsViewer
├─ #sheld                  the chat column (width = --sheldWidth)
│  ├─ #sheldheader.drag-grabber
│  ├─ #chat                messages (§2.3)
│  └─ #form_sheld
│     ├─ #so-hud-root      ← ours (§7)
│     ├─ #dialogue_del_mes
│     └─ #send_form        (§2.4)
├─ #options                ☰ menu (.options-content, #option_* links)
├─ #expression-wrapper / #visual-novel-wrapper   added by the Expressions extension (§2.7)
└─ #so-studio-root         ← ours (§7)
```
(verified: `public/index.html:53,64,66,7737-7738,7882,8048,8080-8129`, `public/scripts/extensions/expressions/index.js:2254-2272`)

### 2.2 Top bar and drawers

Each icon is `#<id>.drawer > .drawer-toggle > .drawer-icon`, followed by a `.drawer-content` panel. `doNavbarIconClick` opens a drawer by swapping `closedDrawer`↔`openDrawer` on the content and `closedIcon`↔`openIcon` on the icon, and it first closes every other `.openDrawer:not(.pinnedOpen)` (verified: `public/script.js:10953-10990`). `.drawer-content` is `position: absolute`, `width: var(--sheldWidth)`, `display: none` until opened, and it has a `backdrop-filter` (verified: `public/style.css:5555-5580`).

| Drawer (`.drawer` id) | Content id | Icon id / note |
|---|---|---|
| `#ai-config-button` | `#left-nav-panel` | `#leftNavDrawerIcon` (verified: `public/index.html:68-72`) |
| `#sys-settings-button` | — | `#API-status-top` (class flips between `fa-plug` and `fa-plug-circle-exclamation`) (verified: `public/index.html:2282-2284`) |
| `#advanced-formatting-button` | `#AdvancedFormatting` | (verified: `public/index.html:4091-4095`) |
| `#WI-SP-button` | — | `#WIDrawerIcon` (verified: `public/index.html:4671-4673`) |
| `#user-settings-button` | `#user-settings-block` | holds Custom CSS `#customCSS` (verified: `public/index.html:4878-4882,5320-5326`) |
| `#backgrounds-button` | `#Backgrounds` | toggle `#backgrounds-drawer-toggle` (verified: `public/index.html:5653-5657`). **Was `#logo_block`.** |
| `#extensions-settings-button` | `#rm_extensions_block` | columns `#extensions_settings` + `#extensions_settings2` (verified: `public/index.html:5750-5791`) |
| `#persona-management-button` | `#PersonaManagement` | (verified: `public/index.html:5833-5837`) |
| `#so-drawer` (ours) | `#drawer-manager` | inserted before `#rightNavHolder` (verified live; §7) |
| `#rightNavHolder` | `#right-nav-panel` | `#rightNavDrawerIcon` (verified: `public/index.html:6001-6006`) |

Selectors like `.drawer-icon[title="User Settings"]` break on non-English UIs. The titles carry `data-i18n="[title]…"` and get translated (verified: `public/index.html:4880`). Use the ids.

Inline (collapsible) drawers inside panels are `.inline-drawer > .inline-drawer-toggle.inline-drawer-header` + `.inline-drawer-icon` + `.inline-drawer-content` (verified: `public/scripts/extensions/expressions/settings.html:2-8`). Every extension settings block uses this shape, ours included.

### 2.3 Chat and message anatomy

Template `#message_template` (verified: `public/index.html:7391-7470`):
```
.mes[mesid][swipeid][ch_name][is_user][is_system][bookmark_link][force_avatar][timestamp][type]
├─ .for_checkbox + input.del_checkbox
├─ .mesAvatarWrapper > .avatar > img  (+ .mesIDDisplay, .mes_timer, .tokenCounterDisplay)
├─ .swipe_left
├─ .mes_block
│  ├─ .ch_name > … > span.name_text + i.mes_ghost + small.timestamp
│  │           > .mes_buttons > .extraMesButtonsHint, .extraMesButtons > .mes_button.mes_translate|sd_message_gen|mes_narrate|mes_prompt|mes_hide|mes_unhide|…|mes_copy
│  │                          > .mes_bookmark, .mes_edit
│  │           > .mes_edit_buttons > .mes_edit_done|…|mes_edit_cancel
│  ├─ details.mes_reasoning_details > summary … .mes_reasoning_header, .mes_reasoning
│  ├─ .mes_text                     ← rendered message HTML
│  ├─ .mes_media_wrapper, .mes_file_wrapper, .mes_bias
└─ .swipeRightBlock > .swipe_right + .swipes-counter
```

Attributes are set on every render (verified: `public/script.js:2647-2658`). All values are **strings**:

| Attribute | Value | Use |
|---|---|---|
| `mesid` | chat index | Renumbered after deletes and moves (verified: `public/script.js:9466-9473`), so it is not a stable id |
| `swipeid` | current swipe index | |
| `ch_name` | `mes.name` **at send time** | Display name, not the avatar file. Renaming a character does not update old messages |
| `is_user` | `"true"` / `"false"` | |
| `is_system` | `"true"` / `"false"` | **Also `"true"` for hidden/ghosted messages**, because `/hide` and the eye button set it (verified: `public/scripts/chats.js:157-162`) |
| `type` | `mes.extra.type` or `""` | `"comment"` for `/comment`, `"narrator"` for narrator messages (verified: `public/scripts/system-messages.js:18-32`, `public/scripts/slash-commands.js:6114-6125`) |
| `timestamp` | formatted date | `.timestamp[title]` holds `"<api> - <model>"` (verified: `public/script.js:2662`), which is the hook for per-model styling |
| `force_avatar`, `bookmark_link` | | |

State classes: `.last_mes` sits on the last `.mes` (verified: `public/script.js:2594-2596`), and swipes are only clickable there (verified: `public/script.js:11146-11147`). `.lastInContext` marks the oldest message still in the prompt, so `#chat > .mes:has(~ .lastInContext)` = messages outside context (verified: `public/script.js:6084-6095`). `.smallSysMes` marks compact system notes such as `/comment compact=true` (verified: `public/script.js:2680-2681`). Comments use `img/quill.png` as avatar and system messages use `img/five.png` (verified: `public/script.js:435-436`).

Lifecycle facts that break naive DOM code:
- Only the last `chat_truncation` messages are in the DOM (default 100), plus a `#show_more_messages` div that is **not** a `.mes` (verified: `public/scripts/power-user.js:133`, `public/script.js:1483`). Do not assume `#chat > :first-child` is a message.
- `.mes_text` innerHTML is replaced on edit, swipe and re-render. Hook ST events (`CHARACTER_MESSAGE_RENDERED`, `USER_MESSAGE_RENDERED`, `MESSAGE_UPDATED`, `MESSAGE_SWIPED`, `MORE_MESSAGES_LOADED`, `CHAT_CHANGED`) rather than caching nodes (verified: `public/scripts/events.js:5-49`).
- The chat style changes the layout. **Flat** is the default and adds no body class. **Bubbles** adds `body.bubblechat`. **Document** adds `body.documentstyle` (verified: `public/scripts/power-user.js:1042-1060`), and document style hides avatars, names, timestamps and the `.mes_buttons` of every message except the last (verified: `public/css/toggle-dependent.css:355-360`). Scope bubble-only rules as `body.bubblechat .mes`, because a bare `.mes` rule hits every style (community-reported, CSS thread 2024-04..2026-05). Slash commands: `/flat`, `/bubble`, `/single` (alias `/story`) (verified: `public/scripts/slash-commands.js:1472-1487`).
- Markdown quotes are wrapped as `<q>` (verified: `public/script.js:1905`). Colours come from `.mes_text q { color: var(--SmartThemeQuoteColor) }` and `.mes_text em { color: var(--SmartThemeEmColor) }`. Italics inside quotes inherit the quote colour (verified: `public/style.css:530-542,557-559`), which was the Feb 2025 change. The revert is `.mes_text q em { color: var(--SmartThemeEmColor); }`.
- The reasoning-header model icon is hidden on purpose: `.mes_reasoning_header>.icon-svg { display: none }`, with a code comment inviting Custom CSS to override it (verified: `public/style.css:473-476`).

### 2.4 Send form and Quick Reply bar

```
#form_sheld > #send_form(.no-connection while disconnected)
   ├─ #qr--bar            (Quick Reply extension; inserted as first child of #send_form)
   ├─ form#file_form
   └─ #nonQRFormItems
      ├─ #leftSendForm > #options_button (☰) [+ #extensionsMenuButton, the wand]
      ├─ textarea#send_textarea
      └─ #rightSendForm > #stscript_continue|pause|stop, #mes_stop, #mes_impersonate, #mes_continue, #send_but
```
(verified: `public/index.html:8084-8123`, `public/scripts/extensions/quick-reply/src/ui/ButtonUi.js:39-44`. The wand `#extensionsMenuButton` is appended to `#leftSendForm` and its menu `#extensionsMenu` to `body`: `public/scripts/extensions.js:692-693`)

- QR: `#qr--bar > .qr--buttons > .qr--button[title]`. `title` is the QR's Title, or its message when no title is set (verified: `public/scripts/extensions/quick-reply/src/QuickReply.js:96,118`). A button with a context menu gets `.qr--hasCtx` + `.qr--button-expander`. **Popout** mode moves the bar to `body > #qr--popout` (verified: `ButtonUi.js:33-37,102`), where `#send_form` selectors no longer match it. Context menus use `.ctx-blocker > .ctx-menu > .ctx-item / .ctx-header`, with `.ctx-sub-menu` for nesting (verified: `public/scripts/extensions/quick-reply/style.css:160-196`).
- The menus `#options` and `#extensionsMenu` sit at `z-index: 29999` (verified: `public/style.css:1084-1095`).
- **Generation state:** `deactivateSendButtons()` sets `body[data-generating="true"]` and `activateSendButtons()` removes it. Swiping sets `body[data-swiping="true"]`. While either is set, CSS hides `#send_but`, `#mes_continue`, `#mes_impersonate` and the last message's buttons, and `#mes_stop` is shown with inline `display:flex` (verified: `public/script.js:3528-3536,7075-7089,10044,10100`, `public/style.css:4577-4584`). See also the project gotcha "ST hides `#send_but` while generating" in `.claude/rules/debug-scripts.md`.
- The autocomplete popup is `.autoComplete-wrap` / `.autoComplete-detailsWrap` (verified: `public/style.css:1649,1700`).

### 2.5 Character list and right panel

`#right-nav-panel` > `#CharListButtonAndHotSwaps` (`#rm_button_characters`, `#HotSwapWrapper .hotswap.avatars_inline`) > `#rm_PinAndTabs` > `#right-nav-panel-tabs` > `#rm_button_selected_ch > h2` (verified: `public/index.html:6006-6030`). The list: `#charListFixedTop` (`#character_sort_order`, `#character_search_bar`, `.rm_tag_controls`) and then `#rm_print_characters_block`, which holds `.character_select` / `.group_select` / `.bogus_folder_select` entries, each with `.avatar`, `.ch_name` and `.ch_additional_info` (verified: `public/index.html:6368-6409`, `public/script.js:946-954`). Favourites get `.is_fav` (verified: `public/script.js:954`). Grid view is `body.charListGrid`. Avatar shape is a setting (Round, which is the default, plus Rectangular/Square/Rounded) that becomes `body.big-avatars|square-avatars|rounded-avatars` (verified: `public/scripts/power-user.js:95-100,141,1036-1038`). That supersedes the community "square avatars" snippet.

On phones the right panel covers the chat. Tapping the top-bar character icon toggles it closed again, and the same works for every top-bar drawer (community-reported, tips thread 2024-09..2025-07; consistent with `doNavbarIconClick`).

### 2.6 Backgrounds

There is **one** background element: `#bg1`, whose `background-image` is set by `backgrounds.js`. The fitting classes are `.cover`, `.contain`, `.stretch` and `.center` (verified: `public/scripts/backgrounds.js:251,266`, `public/css/backgrounds.css:2-37`). **`#bg_custom` no longer exists**. It only survives as dead selectors (verified: `public/css/mobile-styles.css:296`, `public/css/toggle-dependent.css:377`), so snippets using `#bg_custom::after` do nothing. Retarget them to `#bg1`. The drawer lists are `#bg_menu_content` (global) and `#bg_custom_content` (chat tab). Tiles are `.bg_example`, with `.selected-background` on the active one (verified: `public/index.html:5733-5736`, `public/scripts/backgrounds.js:1641-1650`). On mobile the chat panel covers most of the page background, so "page background" effects seem to do nothing there. The working mobile variant is a `position: fixed` `body::after` overlay (community-reported, CSS thread 2024-04..2026-05). Switching backgrounds from code or a story belongs to `.claude/skills/st-image-generation/`.

### 2.7 VN (waifu) mode and expressions

- VN mode = `power_user.waifuMode` → `body.waifuMode` (verified: `public/scripts/power-user.js:977`). Toggle it with `/vn` (verified: `public/scripts/power-user.js:4116`). In this mode `#sheld` shrinks to the bottom 40vh (verified: `public/css/toggle-dependent.css:394-399`).
- Solo sprite: `#expression-wrapper > #expression-holder.expression-holder > img#expression-image.expression`, appended to `body` by the Expressions extension (verified: `public/scripts/extensions/expressions/index.js:2254-2264`).
- Group sprites: `#visual-novel-wrapper > .expression-holder[data-avatar="<avatar file>"]`. These are used only when `!isMobile() && waifuMode && groupId` (verified: `…/expressions/index.js:138-140,252,502-509`).
- **Mobile:** at ≤1000px `.expression-holder { display: none }` and `body:not(.waifuMode) #expression-wrapper { visibility: hidden }` (verified: `public/css/mobile-styles.css:443-445,455-457`). On a phone, sprites show **only** with VN mode on. That matches the community tip.

Representative snippets:
```css
/* VN mode: show only the newest message (needs the max-height) */
body.waifuMode div#sheld { height: fit-content; top: unset; display: flex; flex-direction: column; }
body.waifuMode div#sheld > #chat { height: fit-content; flex: 1 1 auto;
  max-height: calc(100vh - calc(var(--topBarBlockSize) + var(--bottomFormBlockSize)) - 9px); }
body.waifuMode div#sheld > #chat > .mes { display: none; }
body.waifuMode div#sheld > #chat > .mes:last-child { display: flex; }
body.waifuMode div#sheld > #form_sheld { flex: 0 0 auto; }

/* Solo expression sprite pinned top-left instead of bottom-left */
#expression-wrapper .expression-holder { top: 0; bottom: unset; }
```
(The original used `:nth-last-child(1 of :not(.navchat--hidden))`. `.navchat--hidden` comes from a third-party extension.)

### 2.8 Popups, toasts, menus, login and splash

- ST popups are native `<dialog class="popup">`. Global rule: `dialog { color: var(--SmartThemeBodyColor) }` (verified: `public/css/popup.css:4-6`). Buttons are `.popup-button-ok|cancel|custom` (what `scripts/debug/so-ui.mts` clicks).
- Toasts: `#toast-container > .toast.toast-error|warning|info|success`, top-centre, pushed below the top bar (verified: `public/script.js:348-349`, `public/style.css:4008-4012`).
- Loader: `#loader.splash-screen`, `.splash-logo`, `.splash-message`, `#load-spinner` (verified: `public/script.js:705-714`, `public/css/loader.css:19,58-82`).
- Login page: `body.login` > `#dialogue_popup` > `#dialogue_popup_holder` > `#logoBlock`, `#normalLoginPrompt`, `#userListBlock > #userList > .userSelect` (`.avatar`, `.userName`, `.userHandle`) (verified: `public/login.html:37-54`, `public/scripts/login.js:232-233`). This can only be styled through `user.css` (§1.1).

### 2.9 CSS variables worth using

Defined on `:root` in `public/style.css` (verified: lines 22, 62-63, 71-82, 92-98, 107-114, 122-124, 132): `--SmartThemeBodyColor`, `--SmartThemeEmColor`, `--SmartThemeUnderlineColor`, `--SmartThemeQuoteColor`, `--SmartThemeBlurTintColor`, `--SmartThemeChatTintColor`, `--SmartThemeUserMesBlurTintColor`, `--SmartThemeBotMesBlurTintColor`, `--SmartThemeShadowColor`, `--SmartThemeBorderColor`, `--SmartThemeBlurStrength`, `--sheldWidth` (chat width), `--mainFontSize` (= `--fontScale × 15px`), `--mainFontFamily`, `--monoFontFamily`, `--topBarBlockSize`, `--topBarIconSize`, `--bottomFormBlockSize`, `--doc-height` (set by JS to `innerHeight`, verified: `public/index.html:8223`), `--interactable-outline-color(-faint)` (focus outline, set `transparent` to disable), `--avatar-base-width|height|border-radius`, `--animation-duration-slow`. **`--SmartThemeQColor` does not exist.** It appears in a 2024 snippet; the real name is `--SmartThemeQuoteColor`. Font Awesome 6 Free is bundled (`public/css/fontawesome.min.css`). To swap a glyph, use `content: "\fXXX"` with the icon's unicode and `font-family: "Font Awesome 6 Free"`.

### 2.10 Body state classes (toggle-driven, all verified in `public/scripts/power-user.js`)

`no-hotswap` 471 · `no-timer` 476 · `no-timestamps` 481 · `no-modelIcons` 486 · `no-tokenCount` 491 · `no-mesIDDisplay` 496 · `hideChatAvatars` 501 · `expandMessageActions` 506 · `reduced-motion` 526 · `swipeAllMessages` 536 · `no-blur` 960 · `waifuMode` 977 · `movingUI` 1007 · `noShadows` 1023 · `big-avatars`/`square-avatars`/`rounded-avatars` 1036-1038 · `bubblechat`/`documentstyle` 1053-1054 · `charListGrid` 1832. Also `body.PWA` when running as an installed web app (verified: `public/script.js:798-802`) and `body.safari` (verified: `public/scripts/browser-fixes.js:64`).

---

## 3. Per-character and per-state styling hooks

| Goal | Selector | Caveat |
|---|---|---|
| One character's messages | `.mes[ch_name="Alice"]` | Exact display name at send time. Persona messages use the persona name |
| User vs AI | `.mes[is_user="true"]` / `[is_user="false"]` | |
| Any UI rule only while a character is in the chat | `body:has(.mes[ch_name="Alice"]) #…` | Needs at least one rendered message from them, and gets messy in groups (community-reported, CSS thread 2024-04..2026-05) |
| Greeting only | `.mes[mesid="0"]` | `mesid` renumbers when earlier messages are deleted |
| Newest message | `.last_mes` | |
| Out-of-context history | `#chat > .mes:has(~ .lastInContext)` | |
| Comments / narrator | `.mes[type="comment"]`, `.mes[type="narrator"]` | Better than the community's `:has([src="img/quill.png"])` |
| Hidden (ghost) messages | `.mes[is_system="true"]:not([type])`… | `is_system` also covers real system notes. Exclude by `type` or `.smallSysMes` |
| While generating | `body[data-generating="true"] …` | Also `[data-swiping="true"]` |
| Per model | `.timestamp[title*="gpt-4o"]` | The title is `"<api> - <model>"`. Order the rules from general to specific (`command` before `command-r`) |
| Your own regex-inserted HTML | `.custom-<yourclass>` | §1.3 |
| One QR button | `.qr--button[title="…"]` | |

Representative snippets (kept because each demonstrates a hook):
```css
/* per-character quote colour + name replacement */
.mes[ch_name="Alice"] .mes_text q { color: green; }
.mes[ch_name="Stella"] span.name_text { text-indent: -9999px; line-height: 0; }
.mes[ch_name="Stella"] span.name_text::after { content: "New Name"; display: block; text-indent: 0; line-height: inherit; }

/* per-character banner (Rivelle): relative box + ::before image layer, text raised above it */
#chat .mes[ch_name="Name"] { position: relative; padding: 120px 25px 15px !important; }
#chat .mes[ch_name="Name"]::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 150px;
  background: url(/characters/Name/banner.png) top center / cover no-repeat;   /* 900×200 recommended */
  mask-image: linear-gradient(to bottom, black 60%, transparent); pointer-events: none; z-index: 2; }
#chat .mes .mes_block .mes_text, #chat .mes_block .ch_name { position: relative; z-index: 3; }

/* fade messages that fell out of context */
#chat > .mes:has(~ .lastInContext) { opacity: .5; }

/* message buttons only on hover (pairs with User Settings → Expand Message Actions) */
.mes .mes_buttons { visibility: hidden; opacity: 0; transition: visibility 0s .5s, opacity .5s linear; }
.mes:hover .mes_buttons { visibility: visible; opacity: 1; transition: opacity .5s linear; }

/* Quick Replies expand only while the input area is hovered or focused (desktop + mobile) */
#qr--bar { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 2s, opacity 1.5s ease-in-out !important; }
#send_form:hover #qr--bar, #send_form:focus-within #qr--bar { max-height: 50dvh; opacity: 1; }
```
Local image URLs: `/characters/<Name>/<file>` is served from `data/<user>/characters/<Name>/`, and `/user/images/<file>` from `data/<user>/user/images/` (verified: `src/users.js:1213-1217`, `src/constants.js:25,29`). Keep images out of `public/`. (The thread says "`/data/<user>/images`", but the real path has an extra `user/`.)

---

## 4. Stale, renamed and third-party selectors seen in community CSS

| Seen in snippets | Status (verified against current source) | Use instead |
|---|---|---|
| `#logo_block` | Gone | `#backgrounds-button` (`public/index.html:5653`) |
| `#bg_custom` | Element gone, dead CSS only | `#bg1` |
| `--SmartThemeQColor` | Never defined | `--SmartThemeQuoteColor` |
| `.hotswapAvatar` | Not in core | `#HotSwapWrapper .avatar` |
| `public/css/user.css` | Moved | `data/_css/user.css` |
| `.flex-container:has(>.swipe_right)` | Works | `.swipeRightBlock` (`public/index.html:7466`) |
| `.mes_copy[title="Copy"]`, `.mes_translate[title="Translate message"]`, `.drawer-icon[title="…"]` | Work in English only. Titles are translated via `data-i18n="[title]…"` | Class/id selectors (`.mes_copy`, `.mes_translate`, the drawer ids) |
| `.fa-pencil-alt::before` | Edit button is `.mes_edit.fa-pencil` now (`public/index.html:7430`). Snippets list both, so they still hit | `.mes_edit::before` |
| "Square avatars" snippet | Superseded | Avatar style setting (§2.5) |
| "Quoted italics take italic colour" (2024) | Reversed in Feb 2025 | §2.3 |
| `#quickPersona*`, `#extensionTopBar*`, `.navchat--hidden`, `.mfc--*`, `.sttt--*`/`data-sttt--title`, `.csss--body`, `.custom-suggestion` | Third-party extensions, absent from core | Only valid with that extension installed |
| `--topBarBlockSize-500px`, `top-settings-holder:hover` (no `#`), `display: visibility`, `class:` property | Invalid CSS in posted snippets | — |

---

## 5. UI-breaking gotchas and recovery

1. **Hiding the top bar locks you out of Custom CSS.** The "invisible top bar until hover" snippet shipped `top-settings-holder:hover` without the `#`, so the hover never restored it and the user could not reach User Settings (community-reported, CSS thread 2024-04..2026-05). The same happens if you hide `#top-settings-holder`, `#user-settings-button` or the Custom CSS box itself (`.flex-container:has(> textarea#customCSS)`).
2. **Recovery, in order of least effort:**
   - DevTools console: `document.getElementById('custom-style').remove()`. This restores the UI for the session so you can edit the box.
   - From the chat input, if it is still visible: `/theme Azure` (or any bundled theme). It overwrites Custom CSS with `""` (§1.1), so copy your theme settings first.
   - With ST stopped, open `data/<user>/settings.json` (back it up first), find `"power_user"` → `"custom_css"`, delete the offending rules, keep the JSON valid, and restart. `user.css` breakage: edit `data/_css/user.css`.
   - `/resetpanels` (alias `/resetui`) resets UI panels to their original state, which undoes MovingUI drags but not CSS (verified: `public/scripts/power-user.js:4212-4215`).
3. **An unclosed brace swallows everything after it.** Two thread snippets (the nested blockquote `q` and the ghost-message collapse) are missing a `}`. The model-name mapping block is reported to "break a lot of CSS placed after it", so put it last (community-reported, 2024-08).
4. **`display` vs `visibility`.** ST's `.hidden` is `visibility: hidden !important` (layout kept), not `display: none` (verified: `public/style.css:241-244`). A snippet that sets `display` on something ST hides by visibility (or the reverse) leaves ghosts or gaps.
5. **Ancestor transforms and filters re-anchor fixed overlays.** `html` already has `-webkit-transform: translateZ(0)` (verified: `public/style.css:143-148`; project gotcha in `.claude/rules/gotchas.md`), and every `.drawer-content` has a `backdrop-filter`. A `position: fixed` element inside a drawer is therefore positioned against the drawer. Use native `<dialog>`/`showModal()` (top layer) for overlays, as ST's popups and our Studio do.
6. **Document chat style hides buttons on history.** Extensions that add per-message buttons lose them on every message except the last. The community workaround is Flat style plus CSS that hides avatars, names and timestamps (verified the cause: `public/css/toggle-dependent.css:355-360`).
7. **Hiding `#send_textarea`** (a "CYOA" look) or restyling `#send_but` with `display … !important` breaks anything that types or watches the send button. That includes our debug scripts (§7).
8. **Reverse chat** (`#chat { flex-direction: column-reverse }`) still jumps to the bottom on every message, because scrolling is done in JS (community-reported, CSS thread 2024-04..2026-05).
9. **Mobile Firefox shows a black background on transparent PNG uploads:** hard-refresh with Ctrl+F5. **Mobile PWAs** plus heavy regex HTML substitution have been reported to loop on load (community-reported, tips thread 2024-09..2025-07 / regex guide 2025-02).
10. **Use DevTools to find selectors.** The thread's own advice is F12, then the element picker, then copying ids or `data-*` attributes. Example: Prompt Manager rows are `li.completion_prompt_manager_prompt[data-pm-identifier="…"]` inside `#completion_prompt_manager_list` (verified: `public/scripts/PromptManager.js:1740`, prefix `completion_` at `public/scripts/openai.js:685`). Identifiers differ per preset.

---

## 6. Mobile and browser setup (community tips)

- Install ST as an app for more screen: in Chromium or WebKit browsers use **menu → Add to Home screen** (PWA), or wrap the URL with Hermit on Android. Samsung Internet also supports PWAs and has a high-contrast mode. When installed, `body.PWA` is set, which is a CSS hook for PWA-only tweaks (verified: `public/script.js:798-802`).
- Mobile CSS: wrap overrides in `@media screen and (max-width: 1000px)`, or override the matching rule in `public/css/mobile-styles.css`.
- Mobile QR bar as one scrollable line, and sprites needing VN mode on phones: see §2.4 and §2.7.

---

## 7. Story Orchestrator and ST's DOM (project hooks)

### 7.1 Where our UI lives

| Mount | Exact place | Code |
|---|---|---|
| Top-bar drawer | `#so-drawer.drawer` inserted into `#top-settings-holder` **before `#rightNavHolder`**. Content `#drawer-manager.drawer-content.closedDrawer`, icon `.drawer-icon.fa-route`. Toggled through ST's own `doNavbarIconClick` | `src/index.tsx:422-445`, `src/services/stHost/drawers.ts` |
| HUD | `#so-hud-root` inserted as the **first child of `#form_sheld`**, before `#dialogue_del_mes` and `#send_form`, so it is **not** inside `#send_form`. Renders `#so-hud` | `src/index.tsx:447-454` (verified live) |
| Settings panel | A wrapper `<div>` appended to **`#extensions_settings`** (left column) holding `#story-orchestrator-settings` with an `.inline-drawer`. That puts it two drawers deep under `#rm_extensions_block` | `src/index.tsx:466-471` (verified live) |
| Studio | `#so-studio-root` appended to `body`. `#so-studio-modal` is a native `<dialog>` opened with `showModal()` | `src/index.tsx:457-463`, `src/studio/StudioModal.tsx:83,141-147` |
| Transition notes | `/comment compact=true ◈ …` renders as `.mes.smallSysMes[is_system="true"][type="comment"][ch_name="Note"]` | `src/runtime/effectsApplier.ts:103-107` |
| Background effect | `/bg` + `.bg_example` | `src/services/stHost/backgrounds.ts:7,37` |

Existing project gotchas this doc builds on (in `.claude/rules/gotchas.md` and `.claude/rules/debug-scripts.md`): `<html>`'s `translateZ` transform (modals must be `<dialog>`), `a11y.js` force-rewriting `role="button"` onto `.menu_button`/`.drawer-icon`/`.inline-drawer-icon` (verified: `public/scripts/a11y.js:6-20,65`), `#send_but` hidden during generation, and the settings panel sitting two drawers deep.

### 7.2 Conflicts: community CSS habits vs our UI, and our CSS vs ST

Community snippet → effect on us:
- **Ghost-message collapse** (`.mes[is_system="true"] { … max-height: 3em; .mesAvatarWrapper{display:none} }`) and **comment tinting** (`:has([src="img/quill.png"])`) also catch **our transition notes**, which are `is_system` comments. If a user reports squashed or recoloured "◈ checkpoint" notes, this is why. Their fix is `:not([type="comment"])`.
- **Top-bar `order:` reordering** gives every ST `#…-button` an order ≥ 1. `#so-drawer` keeps the default `order: 0` and **jumps to the front**. **Hide-top-bar-until-hover** hides our drawer toggle with the rest. **Text-label top bars** (`#x-button .drawer-icon{display:none}` + `::after` labels) leave our icon as the only glyph.
- **Global `.drawer-content` layouts** ("edit mode": `left: var(--sheldWidth) !important; width: calc(100dvw - var(--sheldWidth)) !important`) move `#drawer-manager` too. That is expected, but it changes where the drawer renders.
- **`#send_form` tricks** (QR collapse, hover-expand, hiding `#send_textarea`): the HUD is outside `#send_form`, so it is unaffected. Hiding `#send_textarea` breaks `scripts/debug/st-actions.mts` (it fills `#send_textarea`, line 79). A theme that forces `#send_but` visible with `!important` defeats `getGenerationState`'s button-swap signal (`scripts/debug/st-actions.mts:13-35`). `document.body.dataset.generating` is ST's own flag (§2.4) and would survive such themes.
- **VN mode** squeezes `#sheld` to 40vh, and the HUD shares that space with the chat.
- **Restyled `.inline-drawer` / `#extensions_settings`** hits our settings panel. `openStorySettings` decides whether to click the inline toggle with `inlineContent.offsetParent === null` (`src/index.tsx:412-413`), so a theme that hides the content by other means (height 0, opacity) inverts that decision.
- **`.menu_button` / `.text_pole` theming reaches our controls.** We reuse those classes (about 28 and 73 JSX usages under `src/`). That is intended, so we look native.
- **Font snippets:** `html body { font-family }` reaches us. Font-size does not: our roots set `font-size: 1rem` themselves, so Font Scale and `body { font-size }` change ST's text but not our panels.

Our CSS → ST (found while verifying, verified live 2026-09-18; **both fixed 2026-09-19** by scoping all our CSS to the mount roots and dropping the cascade-layers polyfill. An isolated live A/B at Font Scale 1 and 1.3 matched the extension-disabled run on `body`, `#send_form`, `.mes_text` and ST `.hidden` elements, and 1,656 elements of our own UI kept identical computed styles):
- **We overrode ST's base font size (fixed).** `src/styles.css:279-283` (`@layer base { body { @apply text-base } }`) compiles to `body:not(#\#):not(#\#) { font-size: var(--text-base, 1rem); line-height: 1.5 }`. The live body measured 16px against `--mainFontSize` 15px, and forcing `--mainFontSize: 20px` left body at 16px while `#leftNavDrawerIcon` scaled to 40px. **ST's Font Scale setting and any user `body { font-size }` stop affecting inherited text (the chat) while the extension is loaded.**
- **Our tailwind utilities were global and unprefixed, with +4 ID specificity (fixed).** Three names collide with ST core classes: `.flex` and `.overflow-hidden` (compatible), and **`.hidden`**. Tailwind's `display: none` now stacks on ST's `visibility: hidden !important`. A live `div.hidden` computed `display: none; visibility: hidden`, so ST elements toggled with `.hidden` (connection-manager spinner, expression images, `#character_context_menu`) collapse instead of keeping their layout box. Any other extension's `.container`, `.collapse`, `.border`, `.block` … elements are also restyled by our bundle.

---

## Sources

| Thread | URL | Created → last activity | Upvotes / comments |
|---|---|---|---|
| Custom CSS snippet compilation (curated by underscore_x; snippets by Cohee, LenAnderson, RossAscends, Wolfsblvt, Rivelle, et al.) | https://discord.com/channels/1100685673633153084/1226855443586879519 — mirror: https://github.com/luma-inibitor/st-notes/blob/main/ST_discord_CSS_snippets.md | 2024-04-08 → 2026-05-10 | 82 / 284 |
| Using Regex to Insert Character Illustrations/Stickers in Chats (Rivelle), §3.5 CSS | https://discord.com/channels/1100685673633153084/1342397452933664768 | 2025-02-21 → 2025-11-17 | 36 / 28 |
| Community Quick Tips (wit et al.), mobile/browser section | https://discord.com/channels/1100685673633153084/1286355628314333335 | 2024-09-19 → 2025-07-25 | 20 / 37 |

Local dumps: `docs/tutorials/sillytavern-custom-css-snippet-compilation.md`, `docs/tutorials/sillytavern-regex-character-illustrations-stickers.md`, `docs/tutorials/sillytavern-community-quick-tips.md`. Trimmed from those dumps: font, colour, gradient and icon-pack theming, the ~220-line model-name mapping list, login-screen layouts, splash-screen replacement, Prompt Manager divider details and third-party extension tweaks.
