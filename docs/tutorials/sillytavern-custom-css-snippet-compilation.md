---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1226855443586879519
thread_id: "1226855443586879519"
forum_tags: ["UI Tweaks"]
author: "underscore_x #banana"
created: 2024-04-08
last_activity: 2026-05-10
active_span_days: 761
upvotes: 82
reactions_total: 99
reactions: ["upvote 82", "thumbs_up 12", "glepcrazy 5"]
comments: 284
participants: 52
author_replies: 87
scraped: 2026-09-18
---
# SillyTavern — Custom CSS Snippet Compilation (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Custom CSS snippet compilation"
<https://discord.com/channels/1100685673633153084/1226855443586879519>
**Curator:** `underscore_x #banana` (collects snippets; many originally by Cohee, LenAnderson, RossAscends — he says he is "only collating")
**Contributors:** Cohee, LenAnderson, RossAscends, Wolfsblvt, IceFog, ⛧EvilFear⛧, Carsten, Auspician, Luccy, guestavius, angeldevii, Rivelle, Inspector Caracal, Mikael, computer wizard, Avery, BOBcat, Wicked_ali, Small Potato, Llynkurin, Squiddybobble, zerofata, Necessity4Fun, simontheassassin25, TheLonelyDevil, StopTryharding, samantha, Amby, MayzyDayz, Janet Vice, Belfonisis, Nemuri, Hibiki, Zero Lambda
**Thread spans:** 8 Apr 2024 → 10 May 2026 (285 messages)
Scraped 18 Sep 2026.

> Note: `*desconocido*` ("unknown") in the raw export = a Discord channel/thread link that could not be resolved. Where a snippet targets such an unnamed theme/extension, this doc says "unresolved link".

---

## 0. TL;DR

A community paste-bin of ready-to-use **Custom CSS** snippets for SillyTavern: fonts, per-character colours/names/banners, message-button behaviour, swipe arrows, Quick Reply bar tricks, top-bar reordering/relabelling/icon swaps, character-list and favourites layouts, hiding nags and UI clutter, VN-mode tweaks, login and splash screens, backgrounds, a Prompt Manager divider, and a regex+CSS "skill check" chip. For anyone who wants to reshape ST's UI without writing an extension. The thread is **for finished snippets only** — questions/CSS help go to `📔┃ui-themes-chat`.

A Claude-compiled chronological mirror of the thread exists: <https://github.com/luma-inibitor/st-notes/blob/main/ST_discord_CSS_snippets.md> (pinned; curator notes the per-snippet credits there over-credit him).

---

## 1. How to apply CSS in SillyTavern

- **Main box:** *User Settings* tab → scroll to the **Custom CSS** box → paste snippet → **reload chat** (curator's "Custom CSS 101").
- **CSS Snippet Manager extension** — curator: "a MUST-HAVE extension" (link in thread unresolved). The Beer effect below is shared as a Snippet Manager JSON export.
- **`@import` only works in the main Custom CSS box** (guestavius), not in snippet-manager snippets.
- **Per-card CSS via Creator's Notes** (Small Potato): wrap CSS in `<style> … </style>` inside a card's **Creator's Note**; it auto-applies only while that card is open. If it doesn't work: put some text *before* the `<style>` tag, remember the closing tag, and refresh by switching to another chat and back.
- **Per-character selectors** without Creator's Notes: `.mes[ch_name="Name"]` targets one character's messages; `.mes[is_user="true"]` / `[is_user="false"]` target user / non-user messages. `body:has(.mes[ch_name="Name"])` (Rivelle) scopes *any* UI rule to a chat where that character has at least one message (messy in group chats).
- **Login screen CSS** must go in **`/public/css/user.css`** (the Custom CSS box isn't loaded before login).
- **Mobile:** most custom CSS should be wrapped in `@media screen and (max-width: 1000px) { … }` or override `mobile-styles.css` classes (IceFog). ST's mobile breakpoint is 1000px.
- **Recovery if a snippet hides the UI** (Wolfsblvt): open `SillyTavern/data/<your-user>/settings.json` (back it up first), find `"custom_css"`, delete the offending CSS, save, reload ST. Don't break JSON syntax.
- **Local images:** don't put images in `/public`; put them in `/data/<user>/images` (Cohee) — or in a character's folder, e.g. `url(/characters/Celine/banner.png)` which lives under `…/SillyTavern/data/default-user/` (Zero Lambda).
- Font Awesome glyphs: get the **unicode** (not the class) from <https://fontawesome.com/icons> and use it as `content: "\fXXX"`.

---

## 2. Fonts & text size

**Change font app-wide**
```
html body {
font-family: 'Comic Sans MS'
}
```

**Only the message body font**
```
html > body #chat .mes .mes_text {
  font-family: 'Comic Sans MS'
}
```

**Change chat font size**
```
body #chat .mes_text { font-size: 1.5em; }
```

**Font/size for character quotes only, not user text** (Auspician)
```
body #chat .mes[is_user="false"] .mes_text q {
    font-size: 1.4em;
    font-family: 'Caveat';
}
```

**Load a Google font** (guestavius — main CSS box only; default ST font is Noto Sans 15; Atkinson ≈ same height at +1 size, slightly narrower)
```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap');

body { 
  font-family: "Atkinson Hyperlegible";
}
```

**Monospace font app-wide** (autocomplete + code blocks; was "latest staging only" in Jun 2024)
```css
@import url('https://fonts.cdnfonts.com/css/source-code-pro');

body {
  --monoFontFamily: 'Source Code Pro';
}
```

**Justify all text**
```
.mes_text {
  text-align: justify;
}
```

**All non-quote text formatted like italics**
```
.mes_text {
    font-style: italic;
    color: grey;
}

.mes_text q {
    font-style: normal;
}
```

---

## 3. Colours: quotes, italics, blockquotes, main text

**Per-character quote colour**
```
.mes[ch_name="Alice"] .mes_text q { color: green; }
.mes[ch_name="Bob"] .mes_text q { color: red; }
```

**Italics inside quotes — two opposite snippets, pick by ST version**
- 2024 (old ST default coloured quoted italics as italics): make them quote-coloured:
  ```
  .mes_text q em { color: var(--SmartThemeQColor); }
  ```
- **Feb 2025 ST update made quoted italics take the quote colour by default.** To revert to the italics colour (underscore_x, supersedes the need for the above):
  ```css
  .mes_text q em { color: var(--SmartThemeEmColor); }
  ```

**Blockquote colour** (markdown `>` text)
```
.mes_text blockquote {
color: salmon;
}
```

**Style inside a blockquote** (as posted — note it is **missing a closing `}`** for the nested `q` rule; add one if other CSS follows)
```
.mes_text blockquote {
color: grey;
 q {
    color: red
}
```

**New main text / italics / underline colour for chat messages only** (Necessity4Fun — bubble mode as written; drop `body.bubblechat` for other modes)
```
body.bubblechat .mes {
  --SmartThemeBodyColor: 'your color here';
  --SmartThemeEmColor: 'your color here';
  --SmartThemeUnderlineColor: 'your color here';
}
```

**Recolour the drag-grabber icon in the chat only + nudge it inside the chat box** (Necessity4Fun)
```
#sheld .drag-grabber {
  --SmartThemeBodyColor: 'new color here';
  margin-right: 'px value to move it away for the right edge of chatbox'
}
```

**Desaturate the whole UI** (asked re: an unresolved-link Discord-style theme)
```
html {
  filter: saturate(0.5);
}
```

---

## 4. Code blocks

**Code block text colour**
```
#chat code {
color: blue !important;
}
```

**Code blocks need the `pre code` descriptor** (Auspician)
```
body #chat .mes_text pre code { color: white; font-family: 'Garamond'; }
```

**Hide code blocks entirely** (Cohee)
```css
body #chat .mes_text pre { display: none }
```

**Remove syntax-highlight colours** (not "convert to txt" — it just unsets colours, per Cohee)
```css
.mes_text code * {
  color: unset !important;
}
```

**Code as subtle "inner monologue"** (Mikael)
```css
#chat code {
  color: color-mix(in srgb, rgb(0 0 0) 31.4%, var(--SmartThemeQuoteColor));
  font-style: italic;
  border-color: transparent;
  font-family: var(--mainFontFamily);
  quotes: "'" "'";
}

#chat code:before {
  content: open-quote;
}
#chat code:after {
  content: close-quote;
}
```

**Language header on code blocks + swap highlight.js theme** (zerofata — doesn't deform blocks without a language)
```css
@import url('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/tokyo-night-dark.min.css');

code[class*="custom-"] {  
    padding-top: 40px !important;
}

code[class*="custom-"]::before {
    display: block;
    background: #161616;
    padding: 8px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

code[class*="custom-apache"]::before { content: "Apache"; }
code[class*="custom-armasm"]::before { content: "ARM Assembly"; }
code[class*="custom-bash"]::before { content: "Bash"; }
code[class*="custom-c"]::before { content: "C"; }
code[class*="custom-conf"]::before { content: "Config"; }
code[class*="custom-cpp"]::before { content: "C++"; }
code[class*="custom-csharp"]::before { content: "C#"; }
code[class*="custom-css"]::before { content: "CSS"; }
code[class*="custom-diff"]::before { content: "Diff"; }
code[class*="custom-dockerfile"]::before { content: "Dockerfile"; }
code[class*="custom-env"]::before { content: "ENV"; }
code[class*="custom-git"]::before { content: "Git"; }
code[class*="custom-go"]::before { content: "Go"; }
code[class*="custom-graphql"]::before { content: "GraphQL"; }
code[class*="custom-html"]::before { content: "HTML"; }
code[class*="custom-http"]::before { content: "HTTP"; }
code[class*="custom-ini"]::before { content: "INI"; }
code[class*="custom-java"]::before { content: "Java"; }
code[class*="custom-javascript"]::before { content: "JavaScript"; }
code[class*="custom-js"]::before { content: "JavaScript"; }
code[class*="custom-json"]::before { content: "JSON"; }
code[class*="custom-kotlin"]::before { content: "Kotlin"; }
code[class*="custom-latex"]::before { content: "LaTeX"; }
code[class*="custom-lua"]::before { content: "Lua"; }
code[class*="custom-makefile"]::before { content: "Makefile"; }
code[class*="custom-markdown"]::before { content: "Markdown"; }
code[class*="custom-md"]::before { content: "Markdown"; }
code[class*="custom-matlab"]::before { content: "MATLAB"; }
code[class*="custom-negative"]::before { content: "Negative Prompt"; }
code[class*="custom-nginx"]::before { content: "Nginx"; }
code[class*="custom-objectivec"]::before { content: "Objective-C"; }
code[class*="custom-perl"]::before { content: "Perl"; }
code[class*="custom-php"]::before { content: "PHP"; }
code[class*="custom-plaintext"]::before { content: "Text"; }
code[class*="custom-positive"]::before { content: "Positive Prompt"; }
code[class*="custom-powershell"]::before { content: "PowerShell"; }
code[class*="custom-ps1"]::before { content: "PowerShell"; }
code[class*="custom-python"]::before { content: "Python"; }
code[class*="custom-r"]::before { content: "R"; }
code[class*="custom-ruby"]::before { content: "Ruby"; }
code[class*="custom-rust"]::before { content: "Rust"; }
code[class*="custom-scala"]::before { content: "Scala"; }
code[class*="custom-scss"]::before { content:  "SCSS"; }
code[class*="custom-shell"]::before { content: "Shell"; }
code[class*="custom-sh"]::before { content: "Shell"; }
code[class*="custom-sql"]::before { content: "SQL"; }
code[class*="custom-swift"]::before { content: "Swift"; }
code[class*="custom-text"]::before { content: "Text"; }
code[class*="custom-toml"]::before { content: "TOML"; }
code[class*="custom-typescript"]::before { content: "TypeScript"; }
code[class*="custom-ts"]::before { content: "TypeScript"; }
code[class*="custom-vbnet"]::before { content: "VB.NET"; }
code[class*="custom-xml"]::before { content: "XML"; }
code[class*="custom-yaml"]::before { content: "YAML"; }
```

---

## 5. Chat & message layout

**Fixed chat width in pixels**
```css
body {
  --sheldWidth: 1300px;
}
```

**Right padding on messages** — RossAscends: if meant only for bubble style, scope it with `body.bubblechat .mes`, otherwise it hits all modes.
```
html > body #chat .mes {
  padding-right: 60px;
}
```

**Reverse chat direction (bottom to top)** — "will probably still jump to the bottom on every new message as that is done in JS."
```css
#chat {
  flex-direction: column-reverse;
}
```

**Move message action buttons (and the name) to the bottom of a message**
```
.mes .mes_block {
    display: flex;
    flex-direction: column-reverse;
}
```

**Text wraps under the avatar** (guestavius, from <https://momoura.neocities.org/>; works with any non-CSS'd theme). Remove `margin-left: -10px;` if too close to the edge; add `text-align: justify;` for justified text; reload chat after changing `margin-left`. 2024-10 update: `.swipe_left` `bottom` set to 3px to align with the swipe counter after ST's arrows got smaller.
```css
.mes {
  display: block;
}

.mesAvatarWrapper {
  display: inline;
  float: left;
  margin-right: 10px;
}

.mes_block {
  overflow-x: visible;
}

.swipe_right, .swipe_left {
  bottom: 3px;
}

.last_mes .mesAvatarWrapper {
  padding-bottom: 0px;
}

.last_mes .mes_block { 
  padding-bottom: 20px;
} /* 28 flat style, 20 bubbles style */

.mes_text, .last_mes .mes_text {
  padding-right: 0px;
  padding-bottom: 0px;
  margin-left: -10px;
  font-size: 18px;
}
```

**Text wraps around images in a message** (Janet Vice — `left` = image left/text right; `right` = the reverse)
```
.mes_text img:not(.mes_img), .mes_reasoning img:not(.mes_img){
  float: left;
}
```

**Sticky avatar** — stays at the top of the screen while scrolling through its message (Wolfsblvt)
```css
.mesAvatarWrapper {
  position: sticky;
  top: 10px;
}
```

**Style messages not in context** (example: fade)
```
#chat > .mes:has(~ .lastInContext) { opacity: 0.5; }
```

**Collapse hidden ("ghost" / excluded-from-prompt) messages** — made for an unresolved-link Discord theme; needs adjusting for others. As posted it appears to be **missing one closing `}`** (for `html > body`); add it if other CSS follows.
```
html > body {
  .mes[is_system="true"] {
    padding: 0;
    .mesAvatarWrapper { display: none; }
    .mes_block {
      .ch_name {
        z-index: 1;
> :nth-child(1) { display: none; }
        .mes_buttons { transform: translate(-10px, 10px); transition: 0ms; z-index: 100; }
    }
    .mes_text {
      font-size: smaller;
      padding: 0;
      max-height: 3em;
      overflow-y: clip;
      mask: linear-gradient(black 0%, black 50%, transparent 100%);
    }
  }
}
```

**Blue-tinted `/comment` messages + fade hidden non-comment messages** (Luccy)
```css
html > body {
  .mes[is_system="true"]:has([src="img/quill.png"]) {
    background-color: #12345678;
  }
}
```
```css
html > body {
  .mes[is_system="true"]:not( :has([src="img/quill.png"],[src="img/five.png"]) ) .mes_text {
    opacity: .7;
  }
}
```

**Hover glow on messages** (computer wizard — pairs with "buttons on hover", §6)
```
:root {
--SmartThemeUserGlow: color-mix(in srgb, var(--SmartThemeUserMesBlurTintColor) 90%, var(--SmartThemeBodyColor) 10%);
--SmartThemeBotGlow: color-mix(in srgb, var(--SmartThemeBotMesBlurTintColor) 90%, var(--SmartThemeBodyColor) 10%);
}

.mes {
    transition: all 0.3s
}

.mes:hover[is_user="true"] {

    background-color: var(--SmartThemeUserGlow)  !important;
    box-shadow: 0px 0px 10px 0.15px color-mix(in srgb, var(--SmartThemeUserGlow) 80%, var(--SmartThemeBodyColor));
    transition: all 0.3s
}

.mes:hover[is_user="false"] {

    background-color: var(--SmartThemeBotGlow) !important;
    box-shadow: 0px 0px 10px 0.15px color-mix(in srgb, var(--SmartThemeBotGlow) 80%, var(--SmartThemeBodyColor));
    transition: all 0.3s
}
```

**"Text Messaging" bubble-chat look** (Inspector Caracal — bubbles sized to content, user on the right, name/date line hidden)
```css
/* unset default bubble bg stuff */
body.bubblechat .mes {
  padding: 5px;
  border-radius: unset;
  background-color: unset !important;
  margin-bottom: 0;
  border: none;
}
body.bubblechat .mes[is_user="true"] {
  background-color: unset !important;
}
/* reapply w/ modifications to message block */
body.bubblechat .mes_block {
  background-color: var(--SmartThemeBotMesBlurTintColor);
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--SmartThemeBorderColor);
  margin-left: 5px;
  width: max-content;
}
body.bubblechat .mes[is_user="true"] .mes_block {
  background-color: var(--SmartThemeUserMesBlurTintColor);
  order: -1; 
  margin-right: 5px;
  margin-left: auto;
}
body.bubblechat .mes_block {
  padding-bottom: unset;
}
/* hide name/date line */
.mes_block .ch_name { display: none; }
```
(A "mimic messenger app" variant was posted only as a link to `📔┃ui-themes-chat` + screenshot.)

**Document-style lookalike that keeps per-message buttons** (Belfonisis). Problem: *Document* chat style shows the message-button row only on the latest message, so extensions that add buttons (e.g. summary start/end markers) lose them on history. Fix: select **Flat** chat style, then:
```
/* Hide avatars */
#chat .mesAvatarWrapper {
  display: none !important;
}

/* Hide character/user names */
#chat .name_text {
  display: none !important;
}

/* Hide timestamps */
#chat .timestamp {
  display: none !important;
}

/* Hide weird circle icon */
#chat path[id^="circle1--inject"] {
  display: none !important;
}

#chat .mes {
  padding-top: 2px !important;
  margin-top: 2px !important;
}
```
The last rule only tightens spacing (optional).

**One-pixel gap at the bottom of the chat** (Nemuri — self-described "extremely cursed", works for them; note `--topBarBlockSize-500px` is not a real variable, which is likely why the second rule "breaks" into allowing resizing). Posted outside a code block:
```
#sheld {
    max-height: calc(100dvh - var(--topBarBlockSize)) !important;
}
#sheld {
    height: calc(100dvh - var(--topBarBlockSize-500px)) !important;
}
```
If it doesn't work: edit ST's main `style.css` to remove the `-1px` from the `#sheld` height and max-height lines and add `!important`.

---

## 6. Message buttons, swipes, icons

**Show message buttons only on hover** (Wolfsblvt — pairs well with *User Settings → Expand Message Actions* on)
```
.mes .mes_buttons {
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s 0.5s, opacity 0.5s linear;
}
.mes:hover .mes_buttons {
  visibility: visible;
  opacity: 1;
  transition: opacity 0.5s linear;
}
```

**Fade swipe arrows in/out on hover** (BOBcat)
```
.mes .swipe_right, .mes .swipe_left {
  visibility: hidden;
  opacity: 0 !important;
  transition: visibility 0s 0.5s, opacity 0.5s linear;
}
.mes:hover .swipe_left, .mes:hover .swipe_right{
  visibility: visible;
  opacity: 0.3 !important;
  transition: opacity 0.1s linear;
}
```
Same trick for an unresolved-link extension's `.mfc--root` buttons — swap `.mfc--root` for `.timestamp` to fade date/time instead:
```
.mes .mfc--root{
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s 0.5s, opacity 0.5s linear;
}

.mes:hover .mfc--root{
  visibility: visible;
  opacity: 0.3;
  transition: opacity 0.1s linear;
}
```
Larger `mfc--` buttons for that extension:
```css
.mfc--action {
    font-size: 1.5em;
    padding: 0 1em;
}
```

**Smaller swipe arrows** — two versions: curator's font-only, and Cohee's "37.5% smoler" (sets box size too):
```
.swipe_right, .swipe_left {
  font-size: 20px
}
```
```css
#chat .swipe_right, #chat .swipe_left {
  width: 25px;
  height: 25px;
  font-size: 20px;
}
```
Swipe counter font size:
```css
#chat .swipes-counter {
font-size: 10px;
}
```

**Swipe arrows only on the greeting (hide for all later messages)**
```
.mes:not([mesid="0"]) .swipe_right,
.mes:not([mesid="0"]) .swipe_left {
    display: none !important;
}

.swipe_right:not([mesid="0"]) .swipes-counter {
  opacity: 0 !important;
  pointer-events: none;
}
```

**Sticky swipe arrows on the last message** — scroll with the bottom of the chat, don't overlay the avatar; tweak `--max-swipe-spacing` for bigger/smaller avatars (Wolfsblvt)
```css
#chat {
 --max-swipe-spacing: 150px;
}
.swipe_left {
  position: sticky;
  align-self: end;
  margin-left: -25px;
  width: 25px;
  margin-top: var(--max-swipe-spacing);
}
.flex-container:has(>.swipe_right) {
  position: sticky;
  align-self: end;
  margin-left: 12px;
  margin-right: -54px;
  width: 54px;
  margin-top: var(--max-swipe-spacing);
}
```

**Big pencil (edit) icon, all buttons inline** (IceFog)
```
.fa-pencil-alt::before, .fa-pencil::before {
  content: "\f303";
  font-size: xx-large;
}
.mes_buttons, .extraMesButtons {
display: contents;
}
```
Generalised: any symbol as the pencil (Squiddybobble)
```
.fa-pencil-alt::before, .fa-pencil::before {
  content: "[Insert Your Symbol Here]";
  font-size: inherit;
}
.mes_buttons, .extraMesButtons {
  display: contents;
}
```

**Replace the copy icon** (Squiddybobble — the posted `content` string lacks its closing `]`; it's a placeholder anyway)
```
.mes_button.mes_copy[title="Copy"]::before {
  content: "[Your Symbol Here"; 
  display: inline-block;
}
```

**Hide the Translate button**
```
.mes_button.mes_translate[title="Translate message"] {
  display: none;
}
```

**Hide the Prompt (itemization) button on all but the last message, and on all user messages** (angeldevii — the selector includes `.sttt--enabled[data-sttt--title="Prompt"]`, i.e. it assumes a tooltip extension adding those attributes)
```
#chat {
  & .mes:not(.last_mes) .extraMesButtons{
   .mes_button.mes_prompt.fa-solid.fa-square-poll-horizontal.interactable.sttt--enabled[data-sttt--title="Prompt"] {
    display: none;
}
  }
}
#chat {
  & .mes[is_user="true"] .mes_buttons {
    margin-right: 10px !important;
   .mes_button.mes_prompt.fa-solid.fa-square-poll-horizontal.interactable.sttt--enabled[data-sttt--title="Prompt"] {
    display: none;
}
  }
}
```

**Show the model icon inside the reasoning block header** (Wolfsblvt; Cohee considers it redundant)
```css
.mes_reasoning_header > .icon-svg {
    display: block;
}
```

---

## 7. Avatars & display names

**Square avatars** — *now part of ST's default*, kept for reference:
```
body .avatar img,
body .hotswapAvatar,
body .hotswapAvatar img,
body .avatar {
 border-radius: 2px !important;
}
```

**Smaller portrait, hide token count + message id — only for `{{user}}` messages**
```
body #chat .mes[is_user="true"] {
    align-items: stretch;
    .mesAvatarWrapper {
        overflow: hidden;
        width: 60px;
        flex: 0 0 60px;
> .avatar {
            height: 0;
            justify-content: start;
        }
> *:not(.avatar) {
            display: none;
        }
    }
}
```
Replace `[is_user="true"]` with `[ch_name="nameofyourchar"]` for a character; OR multiple targets:
```
body #chat .mes[ch_name="nameofyourchar"],
body #chat .mes[ch_name="nameofchar2"],
body #chat .mes[is_user="true"] {
    align-items: stretch;
    .mesAvatarWrapper {
        overflow: hidden;
        width: 60px;
        flex: 0 0 60px;
> .avatar {
            height: 0;
            justify-content: start;
        }
> *:not(.avatar) {
            display: none;
        }
    }
}
```

**Hide only the user avatar** (guestavius)
```css
.mes[is_user="true"] .avatar { display: none; }
```

**Reposition circle-avatar crop + bigger avatars** (samantha)
```
.mes[is_user="false"] .avatar img {
  object-position: 50% 5% !important;
}

.mes[is_user="true"] .avatar img {
  object-position: 50% 5% !important;
}

#avatar_load_preview, img {
  object-position: 50% 5% !important;
}

 .avatar {
  padding: 1px !important; /* Fix oval carousel ext avatars */
}
 .avatar img {
  object-position: 50% 5% !important;
}
```
```
.mes .mesAvatarWrapper {
  transform: scale(1.2) !important;
  transform-origin: top left;
  margin-right: 15px !important;
}
```

**Custom-shaped avatars via mask PNG** (angeldevii) — put a PNG in `/public/img/` (or better `/data/<user>/images`, see §1):
```
body .avatar img,
body .hotswapAvatar,
body .hotswapAvatar img,
body .avatar  {
    mask-image: url(/img/urfilehere.png);
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    border-radius: 0%;
    width: 60px;
    height: 60px;
}
```
With the Quick Persona extension:
```
#quickPersonaImg, .quickPersonaMenuImg {
    border-radius: 0%;
    border: 0px solid transparent;
    box-shadow: 0 0 0px var(--black50a);
    outline: 0px solid transparent;
    width: 70px;
    height: 70px;
    object-fit: cover;
    object-position: center center;
    mask-image: url(/img/urfilehere.png);
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    border-radius: 0%;
    margin-left: 7px;
    opacity: 1;
}
```
Masked icons can't use normal borders; a favourite "border" instead (made for a heart shape — experiment):
```
.character_select.is_fav .avatar, .group_select.is_fav .avatar, .group_member.is_fav .avatar, .avatar.is_fav {
    -webkit-mask-box-image-source: url(/img/urfilehere.png);
    -webkit-mask-box-image-width: 14.5px;
    -webkit-mask-box-image-height: 4px;
    -webkit-mask-box-image-outset: 1rem;
    background: [whatever colour u want here] !important;
}
```

**Bigger Quick Persona icon** (Wicked_ali)
```
#quickPersona.interactable {
width: 125px;
height: 125px;
}
```

**Replace a character's display name** (thanks Hibiki)
```
.mes[ch_name="Stella"] span.name_text {
    text-indent: -9999px;
    line-height: 0;
}
.mes[ch_name="Stella"] span.name_text:after {
    display: block;
    content: "New Name";
    text-indent: 0;
    line-height: inherit;
}
```
Simplified variant (Amby — stated compatible only with Rivelle's theme, unresolved link):
```
.name_text {
    display: inline-flex !important;
    align-items: baseline;
    font-size: 0px;
    }

.name_text::after {
  content: "◇ss □ater";
  font-size: 1.5rem;
}
```
Hover tagline on a name (angeldevii):
```
.mes[ch_name="Name"] .name_text:hover:after {
content: 'tagline here';
}
```

**Show the character avatar as the full-screen background** (uses the zoomed-avatar popup)
```css
.zoomed_avatar_container {
    max-height: 100svh;
    max-width: 100svw;
    height: 100svh;
    width: 100svw;
}

.zoomed_avatar {
    display: flex;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1 !important;
    width: 100svw !important;
    height: 100svh !important;
    max-width: unset !important;
    max-height: unset !important;
}

.zoomed_avatar img {
    height: 100svh !important;
    object-fit: cover !important;
    object-position: center top;
}
```

---

## 8. Per-character message styling (Rivelle)

### 8.1 Banner image + gradient name + round buttons per character
Rivelle later moved an improved version, with a guide and a Canva template, to a `🌆・themes` post "Individual Character Message St…" (title truncated) — look there for the latest.
```css
/* Character name styling */
.mes[ch_name="Name"] .name_text {
    display: inline-flex !important;
    align-items: baseline;
    text-align: left;
    font-size: 36px;
    font-family: "Ballet", serif; /* Custom font */
    font-style: italic;
    line-height: 1.2;
    padding-right: 5px;

    /* Custom text gradient effect */
    background: linear-gradient(to bottom, 
        rgba(255, 255, 255, 0.8),
        rgba(231, 159, 168, 1)
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;

    /* Custom text shadow */
    text-shadow: 0 0 5px rgba(231, 159, 168, 1), 
                 0 0 10px rgba(255, 255, 255, 0.2);
}

/* Button alignment and layout */
.mes[ch_name="Name"] .mes_buttons,
.mes[ch_name="Name"] .extraMesButtons {
    position: relative;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-start;
    overflow: visible;
    align-items: center;
}

/* Button styles */
.mes[ch_name="Name"] .mes_button, 
.mes[ch_name="Name"] .extraMesButtons > div {
    place-self: center baseline;
    align-self: center;
    font-size: 14px;
    padding: 5px;
    margin-left: 3px;
    border-radius: 50%;
    background: linear-gradient(to bottom, /* Custom button colors */
        rgba(231, 159, 168, 0.8), 
        rgba(255, 255, 255, 0.5)
    );
    color: rgba(255, 255, 255, 0.9); /* Custom button text color */
    box-shadow: 0 0 5px rgba(231, 159, 168, 0.8); /* Custom shadow effect */
    transition: all 0.3s ease-in-out;
}

/* Character message box */
#chat .mes[ch_name="Name"] {
    position: relative;
    padding: 120px 25px 15px !important;
    background: 
        linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0) 90%, rgba(231, 159, 168, 0.5) 100%), /* Custom gradient */
        var(--SmartThemeBotMesBlurTintColor);
    border: rgba(231, 159, 168, 0.7) solid 2px !important; /* Custom border color */
    box-shadow: 3px 3px 10px rgba(231, 159, 168, 0.25) !important; /* Custom shadow */
}

/* Message background image */
#chat .mes[ch_name="Name"]::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 150px;
    background: url("https://iili.io/2srZJGR.png") top center no-repeat; /* Custom image URL */
    background-size: cover;
    mask-image: linear-gradient(to bottom, black 60%, rgba(0,0,0,0) 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 60%, rgba(0,0,0,0) 100%);
    mask-size: 100% 100%;
    -webkit-mask-size: 100% 100%;
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    z-index: 2;
    pointer-events: none;
}

/* Text and name layering adjustment */
#chat .mes .mes_block .mes_text,
#chat .mes_block .ch_name {
    position: relative;
    z-index: 3;
}

/* Icon styling */
.mes[ch_name="Name"] .icon-svg {
    aspect-ratio: 1;
    margin-left: 5px;
    place-self: unset;
}
```
Usage notes (Rivelle):
1. Replace `"Name"` everywhere. Lazy "all non-user characters" version: replace every `.mes[ch_name="Name"]` with `.mes[is_user="false"]`.
2. Banner image: recommended **900 × 200 px**; scales with the message, stays centred at the top; replace the `background: url(...)`. (An earlier "900x20" typo was fixed.)
3. Applies to one character only; defaults remain otherwise.
4. **If using Rivelle's own theme**, change `#chat .mes[ch_name="Name"]` → `#chat .mes[ch_name="Name"] .mes_block` and `#chat .mes[ch_name="Name"]::before` → `#chat .mes[ch_name="Name"] .mes_block::before`.
5. Customisable: `font-family`, gradient colours (`background`, `text-shadow`), button `background`/`color`/`box-shadow`, borders and shadows.
- Local image instead of hosting (Zero Lambda): `background: url(/characters/Celine/banner.png)`; Cohee: or put images in `/data/<user>/images`.

### 8.2 Character image on the character-page panel (`body:has` scoping)
Needs at least one message from that character in the chat; can get messy in group chats.
```
body:has(.mes[ch_name="Keith"]) #CharListButtonAndHotSwaps {
    margin-bottom: 150px;
}

body:has(.mes[ch_name="Keith"]) #CharListButtonAndHotSwaps + hr {
    display: none !important;
}

body.big-avatars:has(.mes[ch_name="Keith"]) #right-nav-panel-tabs::after {
    top: 120px;
}

body:has(.mes[ch_name="Keith"]) #right-nav-panel-tabs::after {
    content: "";
    position: absolute;
    top: 90px;
    left: 0;
    width: 100%;
    height: 150px;
    background: url("https://iili.io/2srZJGR.png") top center no-repeat;
    background-size: cover;
    mask-image: linear-gradient(
        to bottom,
        black 60%,
        rgba(0,0,0,0) 100%
    );
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(
        to bottom,
        black 60%,
        rgba(0,0,0,0) 100%
    );
    -webkit-mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
    pointer-events: none;
    z-index: -1;
}
```

---

## 9. Top bar

**Reorder top-bar icons** (⛧EvilFear⛧; `#logo_block` is the backgrounds button — "legacy code fragment" from when it sported a TAI logo)
```
#logo_block {
  order: 4;
}

#user-settings-button {
  order: 2;
}

#persona-management-button {
  order: 3;
}

#extensions-settings-button {
  order: 3;
}

#sys-settings-button {
  order: 1;
}
```
```
#advanced-formatting-button {
  order: 6;
}

#WI-SP-button {
  order: 7;
}

#rightNavHolder {
  order: 8;
}
```

**Change a top-bar icon** (Font Awesome unicode; tip from Wolfsblvt)
```css
#persona-management-button .drawer-icon::before {
  content: "\f700";
}
```

**Top bar as a horizontally scrollable text menu** (Carsten — **incompatible with the Discord theme**)
```
#ai-config-button {
  & .drawer-toggle::after {
    content: "Sampler Settings";
  }

  & .drawer-icon {
    display: none;
  }
}

#sys-settings-button {
  & .drawer-toggle::after {
    content: "API Connection";
  }

  & .drawer-icon {
    display: none;
  }
}

#advanced-formatting-button {
  & .drawer-toggle::after {
    content: "Prompt Formatting";
  }

  & .drawer-icon {
    display: none;
  }
}

#WI-SP-button {
  & .drawer-toggle::after {
    content: "Injections Manager";
  }

  & .drawer-icon {
    display: none;
  }
}

#user-settings-button {
  & .drawer-toggle::after {
    content: "Personalization Settings";
  }

  & .drawer-icon {
    display: none;
  }
}

#logo_block {
  & .drawer-toggle::after {
    content: "Backgrounds";
  }

  & .drawer-icon {
    display: none;
  }
}

#extensions-settings-button {
  & .drawer-toggle::after {
    content: "Extensions";
  }

  & .drawer-icon {
    display: none;
  }
}

#persona-management-button {
  & .drawer-toggle::after {
    content: "Personas";
  }

  & .drawer-icon {
    display: none;
  }
}

.drawer-toggle,
.openDrawer {
    z-index: 4000;
}

#rightNavHolder {
  & .drawer-toggle::after {
    content: "Characters";
  }

  & .drawer-icon {
    display: none;
  }
}

#top-settings-holder {
  gap: 48px;
  left: 0;
  right: 0;
  z-index: unset;
  overflow-x: scroll;
  justify-content: unset;
  padding-left: calc((var(--sheldWidth) / 2) - 7ex);
  padding-right: calc((var(--sheldWidth) / 2) - 5ex);

  & > * {
    overflow-x: unset;
  }
}

#top-settings-holder .drawer {
  white-space: nowrap;
  width: fit-content;
}

.drawer > .drawer-content {
  position: fixed;
}

#top-settings-holder, #top-bar {
  position: absolute;
}

#top-settings-holder::before {
  content: "";
  z-index: 5000;
  background: linear-gradient(90deg, var(--SmartThemeBlurTintColor) 5%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, var(--SmartThemeBlurTintColor) 95%);
  width: var(--sheldWidth);
  height: var(--topBarBlockSize);
  position: fixed;
  left: 0;
  right: 0;
  margin: auto;
  pointer-events: none;
}

@media screen and (max-width: 1000px) {
  #top-settings-holder {
    padding-right: calc((100svw / 2) - 5ex);
    padding-left: calc((100svw / 2) - 7ex);
  }

  #top-settings-holder::before {
      width: 100svw;
  }
}
```

**Invisible top bar until hovered** (Wicked_ali) — ⚠ a user reported this made the menu vanish so they couldn't reach settings at all (recovery: §1, edit `settings.json`). Observation: the posted hover rule lacks the `#` (`top-settings-holder:hover` instead of `#top-settings-holder:hover`), so the hover never restores opacity. Posted version:
```
top-settings-holder:hover {
  opacity: 1;
}

#top-settings-holder {
    opacity: 0;
transition: all 0.4s ease;

}
```

**Custom SVG icons for the whole top and bottom bars** (Janet Vice, attachment `SillyTavern-Icons.css` — "just edit the svg urls"; retrieved and inlined verbatim):
```css
/* TOP BAR */

#leftNavDrawerIcon::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M9.25 14a3 3 0 1 1 0 6a3 3 0 0 1 0-6m5-10a3 3 0 1 0 0 6a3 3 0 0 0 0-6'/%3E%3Cpath fill='%23000' d='M17.166 7.709a3 3 0 0 0-.021-1.5h4.605a.75.75 0 0 1 0 1.5zm-5.81-1.5a3 3 0 0 0-.022 1.5H1.75a.75.75 0 0 1 0-1.5zm-5 10H1.75a.75.75 0 0 0 0 1.5h4.584a3 3 0 0 1 .022-1.5m5.81 1.5h9.584a.75.75 0 0 0 0-1.5h-9.605a3 3 0 0 1 .02 1.5' opacity='0.5'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#API-status-top.fa-plug-circle-exclamation::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M6.333 2h11.334c.31 0 .464 0 .595.012c1.45.133 2.6 1.34 2.727 2.861c.011.137.011.3.011.624V20.26c0 .872-1.059 1.243-1.558.544a.84.84 0 0 0-1.384 0l-.433.606a1.367 1.367 0 0 1-2.25 0a1.367 1.367 0 0 0-2.25 0a1.367 1.367 0 0 1-2.25 0a1.367 1.367 0 0 0-2.25 0a1.367 1.367 0 0 1-2.25 0l-.433-.605a.84.84 0 0 0-1.384 0c-.5.698-1.558.327-1.558-.545V5.497c0-.324 0-.487.011-.624c.127-1.521 1.277-2.728 2.728-2.861C5.869 2 6.024 2 6.333 2' opacity='0.5'/%3E%3Cpath fill='%23000' d='M10.53 7.47a.75.75 0 1 0-1.06 1.06L10.94 10l-1.47 1.47a.75.75 0 1 0 1.06 1.06L12 11.06l1.47 1.47a.75.75 0 1 0 1.06-1.06L13.06 10l1.47-1.47a.75.75 0 0 0-1.06-1.06L12 8.94zM7.5 14.75a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#API-status-top.fa-plug::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M7.245 2h9.51c1.159 0 1.738 0 2.206.163a3.05 3.05 0 0 1 1.881 1.936C21 4.581 21 5.177 21 6.37v14.004c0 .858-.985 1.314-1.608.744a.946.946 0 0 0-1.284 0l-.483.442a1.657 1.657 0 0 1-2.25 0a1.657 1.657 0 0 0-2.25 0a1.657 1.657 0 0 1-2.25 0a1.657 1.657 0 0 0-2.25 0a1.657 1.657 0 0 1-2.25 0l-.483-.442a.946.946 0 0 0-1.284 0c-.623.57-1.608.114-1.608-.744V6.37c0-1.193 0-1.79.158-2.27c.3-.913.995-1.629 1.881-1.937C5.507 2 6.086 2 7.245 2' opacity='0.5'/%3E%3Cpath fill='%23000' d='M15.06 8.5a.75.75 0 0 0-1.12-1l-3.011 3.374l-.87-.974a.75.75 0 0 0-1.118 1l1.428 1.6a.75.75 0 0 0 1.119 0zM7.5 14.75a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

.drawer-icon[title="AI Response Formatting"]::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M1 12c0-5.185 0-7.778 1.61-9.39C4.223 1 6.816 1 12 1s7.778 0 9.39 1.61C23 4.223 23 6.816 23 12s0 7.778-1.61 9.39C19.777 23 17.184 23 12 23s-7.778 0-9.39-1.61C1 19.777 1 17.184 1 12' opacity='0.5'/%3E%3Cpath fill='%23000' d='M13.926 14.302c.245-.191.467-.413.912-.858l5.54-5.54c.134-.134.073-.365-.106-.427a6.1 6.1 0 0 1-2.3-1.449a6.1 6.1 0 0 1-1.45-2.3c-.061-.18-.292-.24-.426-.106l-5.54 5.54c-.445.444-.667.667-.858.912a5 5 0 0 0-.577.932c-.133.28-.233.579-.431 1.175l-.257.77l-.409 1.226l-.382 1.148a.817.817 0 0 0 1.032 1.033l1.15-.383l1.224-.408l.77-.257c.597-.199.895-.298 1.175-.432q.498-.237.933-.576m8.187-8.132a3.028 3.028 0 0 0-4.282-4.283l-.179.178a.73.73 0 0 0-.206.651c.027.15.077.37.168.633a4.9 4.9 0 0 0 1.174 1.863a4.9 4.9 0 0 0 1.862 1.174c.263.09.483.141.633.168c.24.043.48-.035.652-.207z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#WIDrawerIcon::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M12 20.028V18H8v2.028c0 .277 0 .416.095.472s.224-.006.484-.13l1.242-.593c.088-.042.132-.063.179-.063s.091.02.179.063l1.242.593c.26.124.39.186.484.13c.095-.056.095-.195.095-.472' opacity='0.5'/%3E%3Cpath fill='%23000' d='M8 18h-.574c-1.084 0-1.462.006-1.753.068c-.513.11-.96.347-1.285.667c-.11.108-.164.161-.291.505s-.107.489-.066.78l.022.15c.11.653.31.998.616 1.244c.307.246.737.407 1.55.494c.837.09 1.946.092 3.536.092h4.43c1.59 0 2.7-.001 3.536-.092c.813-.087 1.243-.248 1.55-.494s.506-.591.616-1.243c.091-.548.11-1.241.113-2.171h-8v2.028c0 .277 0 .416-.095.472s-.224-.006-.484-.13l-1.242-.593c-.088-.042-.132-.063-.179-.063s-.091.02-.179.063l-1.242.593c-.26.124-.39.186-.484.13C8 20.444 8 20.305 8 20.028z'/%3E%3Cpath fill='%23000' d='M4.727 2.733c.306-.308.734-.508 1.544-.618C7.105 2.002 8.209 2 9.793 2h4.414c1.584 0 2.688.002 3.522.115c.81.11 1.238.31 1.544.618c.305.308.504.74.613 1.557c.112.84.114 1.955.114 3.552V18H7.426c-1.084 0-1.462.006-1.753.068c-.513.11-.96.347-1.285.667c-.11.108-.164.161-.291.505A1.3 1.3 0 0 0 4 19.7V7.842c0-1.597.002-2.711.114-3.552c.109-.816.308-1.249.613-1.557' opacity='0.5'/%3E%3Cpath fill='%23000' d='M7.25 7A.75.75 0 0 1 8 6.25h8a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 7M8 9.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

.drawer-icon[title="User Settings"]::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M14.279 2.152C13.909 2 13.439 2 12.5 2s-1.408 0-1.779.152a2 2 0 0 0-1.09 1.083c-.094.223-.13.484-.145.863a1.62 1.62 0 0 1-.796 1.353a1.64 1.64 0 0 1-1.579.008c-.338-.178-.583-.276-.825-.308a2.03 2.03 0 0 0-1.49.396c-.318.242-.553.646-1.022 1.453c-.47.807-.704 1.21-.757 1.605c-.07.526.074 1.058.4 1.479c.148.192.357.353.68.555c.477.297.783.803.783 1.361s-.306 1.064-.782 1.36c-.324.203-.533.364-.682.556a2 2 0 0 0-.399 1.479c.053.394.287.798.757 1.605s.704 1.21 1.022 1.453c.424.323.96.465 1.49.396c.242-.032.487-.13.825-.308a1.64 1.64 0 0 1 1.58.008c.486.28.774.795.795 1.353c.015.38.051.64.145.863c.204.49.596.88 1.09 1.083c.37.152.84.152 1.779.152s1.409 0 1.779-.152a2 2 0 0 0 1.09-1.083c.094-.223.13-.483.145-.863c.02-.558.309-1.074.796-1.353a1.64 1.64 0 0 1 1.579-.008c.338.178.583.276.825.308c.53.07 1.066-.073 1.49-.396c.318-.242.553-.646 1.022-1.453c.47-.807.704-1.21.757-1.605a2 2 0 0 0-.4-1.479c-.148-.192-.357-.353-.68-.555c-.477-.297-.783-.803-.783-1.361s.306-1.064.782-1.36c.324-.203.533-.364.682-.556a2 2 0 0 0 .399-1.479c-.053-.394-.287-.798-.757-1.605s-.704-1.21-1.022-1.453a2.03 2.03 0 0 0-1.49-.396c-.242.032-.487.13-.825.308a1.64 1.64 0 0 1-1.58-.008a1.62 1.62 0 0 1-.795-1.353c-.015-.38-.051-.64-.145-.863a2 2 0 0 0-1.09-1.083' clip-rule='evenodd' opacity='0.5'/%3E%3Cpath fill='%23000' d='M15.523 12c0 1.657-1.354 3-3.023 3s-3.023-1.343-3.023-3S10.83 9 12.5 9s3.023 1.343 3.023 3'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#backgrounds-drawer-toggle .drawer-icon::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M18.512 10.077c0 .738-.625 1.337-1.396 1.337s-1.395-.599-1.395-1.337c0-.739.625-1.338 1.395-1.338s1.396.599 1.396 1.338'/%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M18.036 5.532c-1.06-.137-2.414-.137-4.123-.136h-3.826c-1.71 0-3.064 0-4.123.136c-1.09.14-1.974.437-2.67 1.104S2.29 8.149 2.142 9.195C2 10.21 2 11.508 2 13.147v.1c0 1.64 0 2.937.142 3.953c.147 1.046.456 1.892 1.152 2.559s1.58.963 2.67 1.104c1.06.136 2.414.136 4.123.136h3.826c1.71 0 3.064 0 4.123-.136c1.09-.14 1.974-.437 2.67-1.104s1.005-1.514 1.152-2.559C22 16.184 22 14.886 22 13.248v-.1c0-1.64 0-2.937-.142-3.953c-.147-1.046-.456-1.892-1.152-2.559s-1.58-.963-2.67-1.104M6.15 6.858c-.936.12-1.475.346-1.87.724c-.393.377-.629.894-.755 1.791c-.1.72-.123 1.619-.128 2.795l.47-.395c1.125-.942 2.819-.888 3.875.124l3.99 3.825a1.2 1.2 0 0 0 1.491.124l.278-.187a3.606 3.606 0 0 1 4.34.25l2.407 2.077c.098-.264.173-.579.227-.964c.128-.916.13-2.124.13-3.824s-.002-2.909-.13-3.825c-.126-.897-.362-1.414-.756-1.791c-.393-.378-.933-.604-1.869-.724c-.956-.124-2.216-.125-3.99-.125h-3.72c-1.774 0-3.034.001-3.99.125' clip-rule='evenodd'/%3E%3Cpath fill='%23000' d='M17.087 2.61c-.86-.11-1.955-.11-3.32-.11h-3.09c-1.364 0-2.459 0-3.318.11c-.89.115-1.633.358-2.222.92a2.9 2.9 0 0 0-.724 1.12c.504-.23 1.074-.366 1.714-.45c1.085-.14 2.47-.14 4.22-.14h3.915c1.749 0 3.134 0 4.219.14c.559.073 1.064.186 1.52.366a2.9 2.9 0 0 0-.693-1.035c-.589-.563-1.331-.806-2.221-.92' opacity='0.5'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

.drawer-icon[title="Extensions"]::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M17.5 2.75a.75.75 0 0 1 .75.75v2.25h2.25a.75.75 0 0 1 0 1.5h-2.25V9.5a.75.75 0 0 1-1.5 0V7.25H14.5a.75.75 0 0 1 0-1.5h2.25V3.5a.75.75 0 0 1 .75-.75' clip-rule='evenodd'/%3E%3Cpath fill='%23000' d='M2 6.5c0-2.121 0-3.182.659-3.841S4.379 2 6.5 2s3.182 0 3.841.659S11 4.379 11 6.5s0 3.182-.659 3.841S8.621 11 6.5 11s-3.182 0-3.841-.659S2 8.621 2 6.5m11 11c0-2.121 0-3.182.659-3.841S15.379 13 17.5 13s3.182 0 3.841.659S22 15.379 22 17.5s0 3.182-.659 3.841S19.621 22 17.5 22s-3.182 0-3.841-.659S13 19.621 13 17.5'/%3E%3Cpath fill='%23000' d='M2 17.5c0-2.121 0-3.182.659-3.841S4.379 13 6.5 13s3.182 0 3.841.659S11 15.379 11 17.5s0 3.182-.659 3.841S8.621 22 6.5 22s-3.182 0-3.841-.659S2 19.621 2 17.5' opacity='0.5'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

.drawer-icon[title="Persona Management"]::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='currentColor' d='M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10' opacity='0.5'/%3E%3Cpath fill='currentColor' d='M8.397 15.553a.75.75 0 0 1 1.05-.155c.728.54 1.607.852 2.553.852s1.825-.313 2.553-.852a.75.75 0 1 1 .894 1.204A5.77 5.77 0 0 1 12 17.75a5.77 5.77 0 0 1-3.447-1.148a.75.75 0 0 1-.156-1.049M15 12c.552 0 1-.672 1-1.5S15.552 9 15 9s-1 .672-1 1.5s.448 1.5 1 1.5m-6 0c.552 0 1-.672 1-1.5S9.552 9 9 9s-1 .672-1 1.5s.448 1.5 1 1.5'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#rightNavDrawerIcon::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='m13.629 20.472l-.542.916c-.483.816-1.69.816-2.174 0l-.542-.916c-.42-.71-.63-1.066-.968-1.262c-.338-.197-.763-.204-1.613-.219c-1.256-.021-2.043-.098-2.703-.372a5 5 0 0 1-2.706-2.706C2 14.995 2 13.83 2 11.5v-1c0-3.273 0-4.91.737-6.112a5 5 0 0 1 1.65-1.651C5.59 2 7.228 2 10.5 2h3c3.273 0 4.91 0 6.113.737a5 5 0 0 1 1.65 1.65C22 5.59 22 7.228 22 10.5v1c0 2.33 0 3.495-.38 4.413a5 5 0 0 1-2.707 2.706c-.66.274-1.447.35-2.703.372c-.85.015-1.275.022-1.613.219c-.338.196-.548.551-.968 1.262' opacity='0.5'/%3E%3Cpath fill='%23000' d='M10.99 14.308c-1.327-.978-3.49-2.84-3.49-4.593c0-2.677 2.475-3.677 4.5-1.609c2.025-2.068 4.5-1.068 4.5 1.609c0 1.752-2.163 3.615-3.49 4.593c-.454.335-.681.502-1.01.502s-.556-.167-1.01-.502'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

/* BOTTOM BAR */

#options_button::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23000' stroke-linecap='round' stroke-width='1.5'%3E%3Cpath d='M20 7H4'/%3E%3Cpath d='M20 12H4' opacity='0.5'/%3E%3Cpath d='M20 17H4'/%3E%3C/g%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#extensionsMenuButton::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M3.845 3.845a2.883 2.883 0 0 0 0 4.077L5.432 9.51c.012-.014.555.503.568.49l4-4c.013-.013-.504-.556-.49-.568L7.922 3.845a2.883 2.883 0 0 0-4.077 0m1.288 11.462a.483.483 0 0 1 .9 0l.157.4a.48.48 0 0 0 .272.273l.398.157a.486.486 0 0 1 0 .903l-.398.158a.48.48 0 0 0-.272.273l-.157.4a.483.483 0 0 1-.9 0l-.157-.4a.48.48 0 0 0-.272-.273l-.398-.158a.486.486 0 0 1 0-.903l.398-.157a.48.48 0 0 0 .272-.274z' opacity='0.5'/%3E%3Cpath fill='%23000' d='M19.967 9.13a.483.483 0 0 1 .9 0l.156.399c.05.125.148.224.273.273l.398.158a.486.486 0 0 1 0 .902l-.398.158a.5.5 0 0 0-.273.273l-.156.4a.483.483 0 0 1-.9 0l-.157-.4a.5.5 0 0 0-.272-.273l-.398-.158a.486.486 0 0 1 0-.902l.398-.158a.5.5 0 0 0 .272-.273z' opacity='0.2'/%3E%3Cpath fill='%23000' d='M16.1 2.307a.483.483 0 0 1 .9 0l.43 1.095a.48.48 0 0 0 .272.274l1.091.432a.486.486 0 0 1 0 .903l-1.09.432a.5.5 0 0 0-.273.273L17 6.81a.483.483 0 0 1-.9 0l-.43-1.095a.5.5 0 0 0-.273-.273l-1.09-.432a.486.486 0 0 1 0-.903l1.09-.432a.5.5 0 0 0 .273-.274z' opacity='0.7'/%3E%3Cpath fill='%23000' d='M10.568 6.49c-.012.014-.555-.503-.568-.49l-4 4c-.013.013.504.556.49.568l9.588 9.587a2.883 2.883 0 1 0 4.078-4.077z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  transform: scaleX(-1);
}

#mes_impersonate::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M21 16.5a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0'/%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M1.25 10A.75.75 0 0 1 2 9.25h20a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1-.75-.75' clip-rule='evenodd'/%3E%3Cpath fill='%23000' d='m4.188 9.25l.426-1.705c.545-2.183.818-3.274 1.632-3.91C7.06 3 8.185 3 10.435 3h3.13c2.25 0 3.375 0 4.189.635c.814.636 1.086 1.727 1.632 3.91l.427 1.705z' opacity='0.5'/%3E%3Cpath fill='%23000' d='M10 16.5a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0'/%3E%3Cpath fill='%23000' d='M9.884 17.397a3.5 3.5 0 0 0 .025-1.69l.414-.207a3.75 3.75 0 0 1 3.354 0l.413.206a3.5 3.5 0 0 0 .026 1.69l-1.11-.555a2.25 2.25 0 0 0-2.012 0z' opacity='0.5'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#mes_continue::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M3.25 12a.75.75 0 0 1 .75-.75h9.25v1.5H4a.75.75 0 0 1-.75-.75' clip-rule='evenodd' opacity='0.5'/%3E%3Cpath fill='%23000' d='M13.25 12.75V18a.75.75 0 0 0 1.28.53l6-6a.75.75 0 0 0 0-1.06l-6-6a.75.75 0 0 0-1.28.53z'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}

#send_but::before {
  content: '';
  display: block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' fill-rule='evenodd' d='M3.464 20.536C4.93 22 7.286 22 12 22s7.071 0 8.535-1.465C22 19.072 22 16.714 22 12s0-7.071-1.465-8.536C19.072 2 16.714 2 12 2S4.929 2 3.464 3.464C2 4.93 2 7.286 2 12s0 7.071 1.464 8.535' clip-rule='evenodd' opacity='0.5'/%3E%3Cpath fill='%23000' d='m13.423 17.362l3.512-9.166a.863.863 0 0 0-1.131-1.13l-9.166 3.511c-.83.319-.857 1.483-.04 1.731l3.477 1.057c.27.082.478.29.56.56l1.057 3.477c.248.817 1.412.79 1.73-.04'/%3E%3C/svg%3E");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}
```
> Retrieved through a text-fetch tool, not a raw download. If an icon renders wrong, re-download the original attachment (link in §21).

---

## 10. Quick Reply bar & context menus

**Right-click instead of the "…" expander for QR buttons with a linked context menu** (LenAnderson). Right-click elsewhere still opens the browser menu; it only changes QR behaviour.
```
#qr--bar > .qr--buttons .qr--button.qr--hasCtx > .qr--button-expander,
#qr--popout > .qr--body > .qr--buttons .qr--button.qr--hasCtx > .qr--button-expander
{
    display: none;
}
```
(A variant posted by 🔆 Ren containing `#body > oncontextmenu="return false;"` is not valid CSS — `oncontextmenu` is an HTML attribute — and did not suppress the browser menu. Their attempt at doing it via `pointer-events` disabled all left-clicks instead.)

**Target one QR button by its Tooltip value** (from the button's context settings)
```
.qr--button[title="my button title"] {
  background: red;
}
```

**Remove the QR popout button**
```css
html > body {
    #qr--popoutTrigger {
        display: none;
    }
    #qr--bar {
        padding-right: 0;
    }
}
```

**Collapse QR bar to a thin border, expand on hover** (IceFog — turn on Quick Reply buttons)
```
#qr--bar:hover{
height: 40px;
transition: all 0.5s ease;
}

#qr--bar{
border-top: 4px solid var(--SmartThemeQuoteColor);
height: 4px;
}
```
BOBcat: use `#send_form:hover #qr--bar` instead of `#qr--bar:hover` — much easier to trigger.

**Expand QR only while hovering/focusing the input area — desktop + mobile** (Rivelle; supersedes IceFog's in practice)
```
#qr--bar {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 2s, opacity 1.5s ease-in-out !important;
}

#send_form:hover #qr--bar,
#send_form:focus #qr--bar,
#send_form:active #qr--bar {
    max-height: 50dvh;
    opacity: 1;
    transition: all 1s ease-in-out;
}
```

**Mobile: QR bar as a single scrollable line** (Rivelle — adjust `max-height`; `display: visibility;` is not a valid value, browsers ignore that line)
```
@media screen and (max-width: 1000px) {
    #qr--bar > .qr--buttons, 
    #qr--popout > .qr--body > .qr--buttons {
        --qr--color: transparent;
        margin: 0;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 5px;
        width: 100%;
        flex-direction: row;
        max-height: 40px;
        padding: 5px !important;
    }

    #send_form:hover #qr--bar,
    #send_form:focus #qr--bar,
    #send_form:active #qr--bar {
        display: visibility;
        height: 40px;
        opacity: 1;
    }

    #qr--bar{
        display: none;
        height: 0.1px;
        opacity: 0;
        transition: all 0.8s ease-in-out !important;
    }
}
```

**Stack nested QR sets (e.g. toggle sets) under the default set** (Llynkurin)
```css
.qr--buttons > .qr--buttons{
  display: flex !important;
  width: 100%;
  justify-content: center; 
}
```

**QR bar and non-QR form items on the same line** (Wicked_ali — VN-panel look; pairs with hiding the textarea, §12)
```
#qr--bar {
    justify-content: right;
    width: 50%}

#nonQRFormItems {
    position: relative;
    width: 50%;
}
```

**Cleaner, tighter QRs design** (Rivelle, Sep 2025 — split from her theme; fits more buttons on mobile; uses `--mobileQRsBarHeight`, presumably defined by her theme — set it yourself if unset)
```css
#qr--bar {
    margin-top: 8px !important;

    @media screen and (max-width: 1000px) {
        max-height: calc(38px * var(--mobileQRsBarHeight));
        overflow: auto;
        margin-bottom: 5px !important;
        min-width: 100% !important;
    }

    > .qr--buttons {
        gap: 3px 0 !important;

        &.qr--color {
            background-color: unset;
        }

        .qr--button {
            font-size: calc(var(--mainFontSize) * 0.9);
            margin: 3px !important;

            @media screen and (max-width: 1000px) {
                padding: 3px 4px !important;
            }
        }
    }
    > .qr--buttons .qr--button {
        font-size: calc(var(--mainFontSize) * 0.9);
        font-weight: 500;
        border: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 50%, transparent);

        @media screen and (max-width: 1000px) {
            font-size: calc(var(--mainFontSize) * 0.85);
        }
    }
    .qr--button-expander {
        border-left: 0 !important;
        width: 1em !important;
        margin-left: 2px !important;

        @media screen and (max-width: 1000px) {
            width: 20px;
        }
    }
}

#qr--popout {
    > .qr--body {
        > .qr--buttons {
            &.qr--color {
                background-color: unset;
                gap: 3px;
            }
        }
    }
}

.ctx-menu {
    position: absolute;
    padding: 5px 8px;
    opacity: 1 !important;
    background-color: var(--SmartThemeBlurTintColor) !important;
    backdrop-filter: blur(calc(var(--SmartThemeBlurStrength))) !important;
    -webkit-backdrop-filter: blur(calc(var(--SmartThemeBlurStrength))) !important;

    @media screen and (max-width: 1000px) {
        margin-left: -50px;
    }
}
.ctx-sub-menu {
    opacity: 1 !important;
    background-color: var(--SmartThemeBlurTintColor) !important;
    backdrop-filter: blur(calc(var(--SmartThemeBlurStrength))) !important;
    -webkit-backdrop-filter: blur(calc(var(--SmartThemeBlurStrength))) !important;
}
.ctx-blocker {
    li {
        margin-bottom: 0px !important;
        font-size: var(--mainFontSize);
    }
}
.ctx-item + .ctx-header {
    border-top: 1px dashed color-mix(in srgb, var(--SmartThemeBodyColor) 25%, transparent) !important;
    margin-top: 5px;
    padding-top: 10px;
}
.list-group .list-group-item.ctx-header {
    opacity: 0.8 !important;
    letter-spacing: 0.2px;
}
.ctx-blocker li:hover {
    color: var(--SmartThemeBodyColor);
}
.list-group .list-group-item.ctx-header,
.ctx-item .qr--button-label{
    @media screen and (max-width: 1000px) {
        font-size: calc(var(--mainFontSize) * 0.95) !important;
        padding-bottom: 2.5px;
    }
}
.list-group .list-group-item.ctx-item {
    @media screen and (max-width: 1000px) {
        padding: 1px 5px !important;
    }
}
```

**Scrollbar on QR context menus** (Rivelle — **single-level menus only**; second-level submenus break)
```css
.ctx-menu {
    position: absolute;
    overflow: auto !important;
    max-height: 40vh;
}
```

---

## 11. Character list, hotswap, favourites

**Resizable avatar grid in the character list** (set the first two variables; everything reflows — e.g. HereToHelp: `--avatar-width: 7vw; --avatar-aspect-ratio: calc(2 / 3);` for big 2:3 avatars)
```css
html, body.charListGrid {
  --avatar-width: 10.0vw;
  --avatar-aspect-ratio: calc(3 / 5.0);

  --avatar-border-width: 1px;
  --avatar-fav-border-width: 2px;
  --avatar-padding: 5px;

  #rm_print_characters_block {
    display: grid;
    grid-auto-rows: max-content;
    grid-template-columns: repeat(
      auto-fill,
      minmax(
        calc(
            var(--avatar-width)
          + var(--avatar-border-width)*2
          + var(--avatar-fav-border-width)*2
          + var(--avatar-padding)*2
        ),
        1fr
      )
    );

    .character_select, .group_select {
      width: 100%;
      max-height: unset;
      min-height: unset;
      max-width: unset;
      min-width: unset;
      height: unset;

      .avatar.avatar_collage {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(50%, 1fr));
        img {
          width: 100%;
          height: 100%;
        }
      }

      .avatar, .avatar_collage, .avatar:not(.avatar_collage) img {
        width: var(--avatar-width);
        width: 100%;
        height: unset;
        aspect-ratio: var(--avatar-aspect-ratio);
        max-height: unset;
        min-height: unset;
        max-width: unset;
        min-width: unset;
        display: block;
        flex: 0 0 auto;
      }

      .character_select_container, .group_select_container {
        align-self: center;
        max-width: unset;
        .ch_name, .ch_additional_info {
          max-width: unset;
          white-space: unset;
        }
      }
    }
  }
}
```

**Favourite characters border colour**
```css
#right-nav-panel .character_select.is_fav .avatar, #right-nav-panel .character_select.is_fav .ch_name {
  outline-color: SkyBlue !important;
  color: LightSkyBlue !important;
}
```

**Show only the first N favourites in the hotswap strip** (change 10)
```
#HotSwapWrapper .avatars_inline {
  overflow: visible;
  max-height: unset;
}
#HotSwapWrapper .avatar:nth-child(n+10) {
  display: none;
}
```

**Hotswap strip collapsed to one row, expands on hover/tap** (Rivelle — auto-scroll, rectangular avatars, mobile tap-to-expand; tweak the `25dvh`/`30dvh` expanded heights)
```
/* --- Quick Character Selection ---  */

#HotSwapWrapper .hotswap.avatars_inline {
    display: flex;
    flex-wrap: wrap;
    overflow: hidden;
    justify-content: center;
    scroll-behavior: smooth;
    max-height: calc(var(--avatar-base-height) + 2 * var(--avatar-base-border-radius));
    -ms-overflow-style: none;
    margin: 5px;
    margin-right: 10px;
    transition: all 1s cubic-bezier(0.4, 0, 0.2, 1);

    *:focus {
        outline: none;
    }

    &::-webkit-scrollbar {
        display: none;
    }

    @media screen and (max-width: 1000px) {
        margin-right: 0;
        justify-content: flex-start;
    }
}
/* when using big avatars, increase the collapsed height */
body.big-avatars #HotSwapWrapper .hotswap.avatars_inline {
    max-height: calc(var(--avatar-base-width) * var(--big-avatar-width-factor) + 35px)
}

#HotSwapWrapper:hover .hotswap.avatars_inline {
    /* you can tweak this 25dvh value as needed! */
    max-height: 25dvh !important;
    overflow: auto;
    transition: all 1s cubic-bezier(0.22, 0.61, 0.36, 1);

    @media screen and (max-width: 1000px) {
    /* you can tweak this 30dvh value as needed! */
        max-height: 30dvh !important;
    }
}
#HotSwapWrapper:not(:hover) .hotswap.avatars_inline {
    transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Favourites as a CSS-only carousel with arrow buttons** (Janet Vice, attachment `favs-carousel.css` — ⚠ **Chrome-based browsers only**, uses `::scroll-button`)
```css
.avatars_inline {
  display: flex;
  gap: 5px;
  flex-wrap: nowrap;
  overflow-x: hidden;
  scroll-snap-type: x proximity;
  scroll-behavior: smooth;
  scroll-snap-align: start end;
}

.avatars_inline .avatar {
  scroll-snap-align: start end;
}

/* The magic - pure CSS buttons! */
.avatars_inline::scroll-button(left) {
  content: "‹";
}

.avatars_inline::scroll-button(right) {
  content: "›";
}

/* Style the buttons */
.avatars_inline::scroll-button(*) {
  background: var(--SmartThemeBlurTintColor);
  color: var(--SmartThemeBodyColor);
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.avatars_inline::scroll-button(*):disabled {
  opacity: 0.3;
}
```
Any-browser alternative (attachment `Scroll-Favorites.css`) — one horizontal row, scroll with **Shift + mouse wheel**:
```css
/* SCROLL FAVORITES */
.avatars_inline {
  display: flex;
  gap: 5px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}

#HotSwapWrapper {
  overflow: hidden;
}

/* hide the bottom scroll bar */
.avatars_inline {
  scrollbar-width: none;
}
.avatars_inline::-webkit-scrollbar {
  display: none;
}
/* hide the bottom scroll bar */
```

**Hide the char-list filter/search block until the heading is hovered** (Wolfsblvt, v2 with a collapse indicator; respects the "disable animations" setting; animation only half-works — reserves space then slides)
```css
#charListFixedTop {
  display: none;
  transition: all var(--animation-duration-slow) ease-in-out;
  transform-origin: left top;
  animation: pop-out var(--animation-duration-slow) ease-in-out;
}

#right-nav-panel:has(#rm_PinAndTabs:hover, #rm_PinAndTabs:focus-within) #charListFixedTop,
#charListFixedTop:hover,
#charListFixedTop:focus-within {
  display: block;
  animation: pop-in var(--animation-duration-slow) ease-in-out;
}

#rm_button_selected_ch h2::before {
  vertical-align: middle;
  text-align: center;
  content: "\f13a";
  margin-right: 6px;
  line-height: 10%;
  font-family: "Font Awesome 6 Free";
}

#right-nav-panel:has(#rm_PinAndTabs:hover, #rm_PinAndTabs:focus-within, #charListFixedTop:hover, #charListFixedTop:focus-within) #rm_button_selected_ch h2::before {
  content: "\f139";
}
```

**Remove search/sort/tag controls entirely** (simontheassassin25 — for small libraries / landscape phones)
```css
#character_search_bar,
#character_sort_order,
.rm_tag_controls {
  display: none;
}
```

**Tags-as-folders: same icon for a folder** (angeldevii — uses a tooltip extension's `data-sttt--title`). Replace `.fa-solid` with `.fa-eye-slash` for hidden folders, and `.fa-folder-open` / `.fa-folder-close` for normal folders.
```
.bogus_folder_select .avatar[data-sttt--title="[Folder] (folder-name-here)"] {
.fa-solid::before {
  content: "(whatever-here)";
}
}
```

---

## 12. Input area & bottom bar

**Hide the input placeholder text** ("Type a message, or /? for a command list")
```
#send_textarea::placeholder {
  opacity: 0;
}
```

**Remove the text input entirely** (Wicked_ali — suits the CYOA extension)
```
#send_textarea {
display: none;
}
```

**Raise the input box for mobile keyboards / small screens** (simontheassassin25)
```css
#send_textarea {
    position: relative;
    bottom: 40px; /*Moved up 40 pixels*/
    background-color: rgba(0, 0, 0, 0); /*Fully transparent background*/
    border: 2px solid lightgrey; /*Light grey border*/
    border-radius: 15px; /*Rounded corners (circular effect)*/
    width: 100%; /*Full width*/
    margin: 0 auto; /*Centers the element horizontally*/
    padding: 10px; /*Adds some padding inside*/
    box-sizing: border-box; /*Ensures padding is included in the width calculation*/
}

/*Media Queries for Responsiveness*/
@media (max-width: 768px) { /*For tablets and smaller devices*/
    #send_textarea {
        width: 100%; /*Full width on smaller screens*/
        padding: 8px; /*Slightly less padding for smaller screens*/
    }
}

@media (max-width: 480px) { /*For very small devices like mobile phones*/
    #send_textarea {
        width: 100%; /*Full width on small screens*/
        padding: 6px; /*Even smaller padding for very small screens*/
    }
}
```

**Custom send-button symbol + scale** (Squiddybobble)
```
#send_but {
  font-size: 24px;
}

#send_but::before {
  content: "[Your Symbol Here]"; 
  font-size: 30px;
  display: inline-block;
}
```

**Options menu opens on hovering a border strip** (IceFog — the ☰ button stops working; remove `display: block !important;` to make it a toggle instead). Fix for it showing through settings panels: `z-index` (IceFog).
```
#options {
display: block !important;
border-top: 8px groove var(--SmartThemeQuoteColor);
height: 4px;
width: 2.5em;
transition: 0.3s;
overflow-x: auto;
}
#options:hover  {
height: auto !important;
width: auto !important;
}
```
Maggotkin's attempt at the same for the magic-wand menu (`class: font-family-reset;` is not a CSS property and is ignored):
```
#extensionsMenu.options-content {
class: font-family-reset;
display: block !important;
border-top: 4px groove var(--SmartThemeQuoteColor);
height: 4px;
width: 2.5em;
transition: 1.0s;
overflow-x: auto;
}
#extensionsMenu:hover  {
height: auto !important;
width: auto !important;
}
```

**Hide the autocomplete popup** (StopTryharding)
```
.autoComplete-wrap,
.autoComplete-detailsWrap {
  display: none !important;
}
```

**Left-align suggestions** of an unresolved-link extension (`.custom-suggestion`; thanks Inspector Caracal)
```css
.custom-suggestion {
  align-items: unset !important;
  justify-content: left !important;
  text-align: left !important;
}
```

---

## 13. Panels, drawers, layout modes

**"Edit mode": chat + top bar pinned left, all menus/popups fill the right** (Avery — great for card editing; Chat Width ≈ 50% recommended; desktop only)
```
/*only apply when not in 'mobile' mode. Source: mobile-styles.css*/
@media screen and (min-width: 1000px) {

    /*override bar and sheld to left*/
    #top-bar {
           margin-left: 0px;
    }

    #top-settings-holder {
        margin-left: 0px;
    }

    #sheld {
        margin-left: 0px;
    }

    /*******override other menus to right, adjust size,******/
    /*most menus will follow this*/
    .drawer-content,
    #character_popup {
        left: var(--sheldWidth) !important;
        width: calc(100dvw - var(--sheldWidth)) !important;
        max-height: 100dvh !important;
        min-height: 100dvh !important;
        top: 0;        
    }

    /*make extension menu mobile style else its ugly when it gets thin*/
    #extensions_settings,
    #extensions_settings2 {
           width: 100% !important;
           min-width: 100% !important;
    }

    /*popup character defs*/
    #character_popup{
    
    }

    /*****reorder depth of char and preset screen******/
    #right-nav-panel {
        z-index: -10;
    }

    #left-nav-panel {
        z-index: -5;
    }
    
    /*push some windows back to normal*/
    /*the csss fullscreen popup*/
    .csss--body {
         left: auto !important;
        width: 100dvh !important;
    }
}
```
Known issue (Revan): the character-card button panel still pops out on the left and squashes the left side (with the NoShadowDribbblish theme); no fix posted.

**Left & right panels drop down in the centre like the settings drawers** (Wolfsblvt — for very wide sheld (70+) or mid-size screens where side panels get tiny; keeps non-mobile styling)
```css
#rm_button_panel_pin_div,
#lm_button_panel_pin_div {
    display: none;
}

#rm_button_characters {
    font-size: var(--topBarIconSize);
}

#CharListButtonAndHotSwaps {
    align-items: center;
}

#right-nav-panel,
#left-nav-panel,
#floatingPrompt,
#cfgConfig,
#logprobsViewer,
#movingDivs>div {
    /* 100vh are fallback units for browsers that don't support dvh */
    height: calc(100vh - 45px);
    height: calc(100dvh - 45px);
    min-width: var(--sheldWidth) !important;
    width: var(--sheldWidth) !important;
    max-width: var(--sheldWidth) !important;
    overflow-y: hidden;
    border-left: 1px solid var(--SmartThemeBorderColor);
    border-right: 1px solid var(--SmartThemeBorderColor);
    border-bottom: 1px solid var(--SmartThemeBorderColor);
    border-radius: 0 0 20px 20px;
    top: var(--topBarBlockSize) !important;
    left: 0 !important;
    right: 0 !important;
    margin: 0 auto !important;
    backdrop-filter: blur(calc(var(--SmartThemeBlurStrength) * 2));

    @starting-style {
        height: 0;
    }
}

#left-nav-panel:not(.openDrawer),
#right-nav-panel:not(.openDrawer) {
    height: 0;
}

#left-nav-panel .scrollableInner {
    margin-top: 16px;
}
```

**WI entry header padding** (only needed when an extension adds extra WI fields — unresolved link)
```css
#WIEntryHeaderTitlesPC {
  padding-right: calc(4.5em / 2 * 3) !important;
}
```

**Chat Completion Prompt Manager: bigger drag handles**
```css
#completion_prompt_manager #completion_prompt_manager_list .completion_prompt_manager_prompt:has(.drag-handle.ui-sortable-handle) {
    padding-left: 30px;
}

#completion_prompt_manager #completion_prompt_manager_list .completion_prompt_manager_prompt .drag-handle {
    padding: 10px;
}
```

**Prompt Manager: dashed divider above a chosen prompt** (Rivelle, May 2026; idea by Mina)
1. F12 → element picker → click the prompt you want a divider **above** → copy its `data-pm-identifier="…"` value.
2. Replace every `0068d3ad-f118-4fbb-8265-8948dffb2eb4` below with that ID.
3. Tweak only the top variables: `--pm-separator-gap` (space above/below), `--pm-separator-inset` (side indent; larger = shorter line), `--pm-separator-opacity` (1 visible … 0 invisible), `--pm-separator-dash-width`, `--pm-separator-dash-gap`.
- Different Chat Completion presets can have different prompt IDs — redo step 1 after switching presets.
```css
/* =========================================================
   Prompt Manager Divider
   Adds a dashed separator line above a specified prompt
   ========================================================= */
#completion_prompt_manager #completion_prompt_manager_list {

  /* === Main settings to adjust === */
  --pm-separator-gap: 48px;        /* Space above/below the divider; larger = more spacing */
  --pm-separator-inset: 40px;      /* Left/right indent; larger = shorter line */
  --pm-separator-opacity: 0.25;    /* Line opacity; 0.5 = 50% */
  --pm-separator-dash-width: 3px;  /* Length of each dash */
  --pm-separator-dash-gap: 6px;    /* Gap between dashes */

  /* === Replace the ID below with your target Prompt's ID === */
  li.completion_prompt_manager_prompt:has(
    + li.completion_prompt_manager_prompt[data-pm-identifier="0068d3ad-f118-4fbb-8265-8948dffb2eb4"]
  ) {
    margin-bottom: 0 !important;
  }

  li.completion_prompt_manager_prompt[data-pm-identifier="0068d3ad-f118-4fbb-8265-8948dffb2eb4"] {
    position: relative;
    margin-top: var(--pm-separator-gap) !important;
    overflow: visible;

    &::before {
      content: "";
      position: absolute;
      left: var(--pm-separator-inset);
      right: var(--pm-separator-inset);
      top: calc(var(--pm-separator-gap) / -1.8);
      height: 1px;
      background-image: repeating-linear-gradient(
        to right,
        var(--SmartThemeBodyColor) 0 var(--pm-separator-dash-width),
        transparent var(--pm-separator-dash-width) calc(var(--pm-separator-dash-width) + var(--pm-separator-dash-gap))
      );
      opacity: var(--pm-separator-opacity);
      pointer-events: none;
    }
  }
}
```

---

## 14. Hiding nags, warnings & clutter

**Hide error toasts**
```
html > body #toast-container > .toast.toast-error {
    display: none !important;
}
```
Swap the class to hide other severities: `.toast-info`, `.toast-success`, `.toast-warning`, `.toast-error`.

**Hide the reverse-proxy warning** (Luccy; Cohee: it "exists solely to nag" and shows whenever the URL field has anything)
```css
#ReverseProxyWarningMessage { display: none !important; }
```
Joke inverse — make it 200% and flash while typing in the OpenAI fields (Luccy):
```css
#openai_api > [data-source*="openai"]:has(input:focus) + #ReverseProxyWarningMessage {
  zoom: 200%;
  animation: annoyer 0.5s cubic-bezier(0, 0.6, 0.9, 1) infinite;
}
@keyframes annoyer {
  from { opacity: 0.7; }
  to { opacity: 1.0; }
}
```

**Hide the XTC sampler header** (TheLonelyDevil)
```
label[data-i18n="Exclude Top Choices (XTC)"],
label[data-i18n="Exclude Top Choices (XTC)"] + a[href*="github"] {
    display: none;
}
```

**Hide toggle descriptions**
```
.toggle-description { display: none !important;}
```

**Hide OpenAI model groups you don't use** (⛧EvilFear⛧ — delete lines for groups you want to keep)
```
#model_openai_select optgroup[label="GPT-3.5 Turbo Instruct"],
#model_openai_select optgroup[label="GPT-4"],
#model_openai_select optgroup[label="GPT-3.5 Turbo"],
#model_openai_select optgroup[label="gpt-4o"],
#model_openai_select optgroup[label="gpt-4o-mini"],
#model_openai_select optgroup[label="GPT-4 Turbo"],
#model_openai_select optgroup[label="Other"],
#model_openai_select #openai_external_category {
    display: none !important;
}
```

**Hide the Custom CSS box itself** (⛧EvilFear⛧ — you'll then need `settings.json` or a snippet manager to edit CSS)
```
.flex-container.flexnowrap.alignitemscenter:has(> textarea#customCSS) {
    display: none !important;
}
```

**Hide the scrollbar on overflow**
```
body { overflow: hidden; }
```

**Focus outline on inputs/dropdowns** (Wolfsblvt, Jun 2024 — new default outline). Disable (also hides keyboard-navigation focus):
```css
body {
  --interactable-outline-color: transparent;
  --interactable-outline-color-faint: transparent;
}
```
Or theme it (orange):
```css
body {
  --interactable-outline-color: rgba(225, 138, 36, 1);
  --interactable-outline-color-faint: rgba(225, 138, 36, 0.3);
}
```

---

## 15. Model name / icon on message timestamps

**Custom icon for a model id** (example: kayra → civitai favicon)
```css
.timestamp[title*="kayra"] ~ .timestamp-icon {
  display: none;
}

.timestamp[title*="kayra"]::after {
    display: inline-flex;
    height: 14px;
    width: 14px;
    content: ' ';
    margin-left: 5px;
    background-image: url(https://civitai.com/favicon.ico);
    background-size: contain;
}
```

**Show the model name after the model icon** (guestavius, from <https://rentry.org/tavern-model-names>; still shows when icons are disabled). Displays e.g. `WizardLM-2 8x22B` instead of `openrouter - microsoft/wizardlm-2-8x22b`.
- For `title*=` selectors **order matters**: put `command-r` after `command`, otherwise every Command model shows as "Command".
- Later edit: **it breaks a lot of CSS placed after it — put it at the bottom** of your Custom CSS.
- Model list is a mid-2024 snapshot.

Barebones (`model_name_barebones.css`, attachment inlined) — shows the raw title; add your own mappings under the last comment:
```css
.timestamp::after {
  display: inline-block;
  width: 0px;
  overflow: visible;
  white-space: pre;
  /* icon size + gap x 2 */
  transform: translate(calc(5px * 2 + 14px));
  color: var(--SmartThemeBodyColor);

  content: attr(title);
}

body.no-modelIcons .timestamp::after {
  transform: translate(calc(10px));
}

body.no-timestamps .timestamp {
  position: relative;
  white-space: pre;
  overflow: visible;
  display: block !important;
  color: transparent !important;
  width: 0;
  height: 0;
}
body.no-timestamps .timestamp::after {
  position: absolute;
  left: 0;
}

/* Insert selectors below */
```

Full version (`model_name_full.css`) = the barebones block above **plus** these mappings (attachment inlined):
```css
.timestamp[title*="c4ai-aya-23"]::after { content: "Aya 23"; }
.timestamp[title*="claude-1.3"]::after { content: "Claude 1.3"; }
.timestamp[title*="claude-2.0"]::after { content: "Claude 2.0"; }
.timestamp[title*="claude-2.1"]::after { content: "Claude 2.1"; }
.timestamp[title*="claude-3-5-sonnet"]::after { content: "Claude 3.5 Sonnet"; }
.timestamp[title*="claude-3-haiku"]::after { content: "Claude 3 Haiku"; }
.timestamp[title*="claude-3-opus"]::after { content: "Claude 3 Opus"; }
.timestamp[title*="claude-3-sonnet"]::after { content: "Claude 3 Sonnet"; }
.timestamp[title*="claude-instant-1.1"]::after { content: "Claude Instant 1.1"; }
.timestamp[title*="claude-instant-1.2"]::after { content: "Claude Instant 1.2"; }
.timestamp[title*="codestral"]::after { content: "Codestral"; }
.timestamp[title*="codestral-mamba"]::after { content: "Codestral Mamba"; }
.timestamp[title*="command"]::after { content: "Command"; }
.timestamp[title*="command-light"]::after { content: "Command Light"; }
.timestamp[title*="command-r"]::after { content: "Command R"; }
.timestamp[title*="command-r-plus"]::after { content: "Command R+"; }
.timestamp[title*="gemini-1.0-pro"]::after { content: "Gemini 1.0 Pro"; }
.timestamp[title*="gemini-1.0-pro-vision"]::after { content: "Gemini 1.0 Pro Vision"; }
.timestamp[title*="gemini-1.0-ultra"]::after { content: "Gemini 1.0 Ultra"; }
.timestamp[title*="gemini-1.5-flash"]::after { content: "Gemini 1.5 Flash"; }
.timestamp[title*="gemini-1.5-pro"]::after { content: "Gemini 1.5 Pro"; }
.timestamp[title*="gemini-pro"]::after { content: "Gemini Pro"; }
.timestamp[title*="gemini-pro-vision"]::after { content: "Gemini Pro Vision"; }
.timestamp[title*="gemini-ultra"]::after { content: "Gemini Ultra"; }
.timestamp[title*="gpt-3.5-turbo"]::after { content: "GPT-3.5 Turbo"; }
.timestamp[title*="gpt-3.5-turbo-16k"]::after { content: "GPT-3.5 Turbo 16K"; }
.timestamp[title*="gpt-3.5-turbo-instruct"]::after { content: "GPT-3.5 Turbo Instruct"; }
.timestamp[title*="gpt-4"]::after { content: "GPT-4"; }
.timestamp[title*="gpt-4-32k"]::after { content: "GPT-4 32K"; }
.timestamp[title*="gpt-4-turbo"]::after { content: "GPT-4 Turbo"; }
.timestamp[title*="gpt-4-vision"]::after { content: "GPT-4 Vision"; }
.timestamp[title*="gpt-4o"]::after { content: "GPT-4o"; }
.timestamp[title*="gpt-4o-mini"]::after { content: "GPT-4o mini"; }
.timestamp[title*="mistral-large"]::after { content: "Mistral Large"; }
.timestamp[title*="mistral-medium"]::after { content: "Mistral Medium"; }
.timestamp[title*="mistral-small"]::after { content: "Mistral Small"; }
.timestamp[title*="mistral-tiny"]::after { content: "Mistral Tiny"; }
.timestamp[title*="open-codestral-mamba"]::after { content: "Open Codestral Mamba"; }
.timestamp[title*="open-mistral-7b"]::after { content: "Open Mistral 7B"; }
.timestamp[title*="open-mistral-nemo"]::after { content: "Open Mistral Nemo"; }
.timestamp[title*="open-mixtral-8x22b"]::after { content: "Open Mixtral 8x22B"; }
.timestamp[title*="open-mixtral-8x7b"]::after { content: "Open Mixtral 8x7B"; }

.timestamp[title^="openrouter"][title$="01-ai/yi-34b"]::after { content: "Yi 34B (base)"; }
.timestamp[title^="openrouter"][title$="01-ai/yi-34b-chat"]::after { content: "Yi 34B Chat"; }
.timestamp[title^="openrouter"][title$="01-ai/yi-6b"]::after { content: "Yi 6B (base)"; }
.timestamp[title^="openrouter"][title$="ai21/jamba-instruct"]::after { content: "AI21: Jamba Instruct"; }
.timestamp[title^="openrouter"][title$="allenai/olmo-7b-instruct"]::after { content: "OLMo 7B Instruct"; }
.timestamp[title^="openrouter"][title$="alpindale/goliath-120b"]::after { content: "Goliath 120B"; }
.timestamp[title^="openrouter"][title$="alpindale/magnum-72b"]::after { content: "Magnum 72B"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-1"]::after { content: "Anthropic: Claude v1"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-1.2"]::after { content: "Anthropic: Claude v1.2"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2"]::after { content: "Anthropic: Claude v2"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2.0"]::after { content: "Anthropic: Claude v2.0"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2.0:beta"]::after { content: "Anthropic: Claude v2.0 (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2.1"]::after { content: "Anthropic: Claude v2.1"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2.1:beta"]::after { content: "Anthropic: Claude v2.1 (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-2:beta"]::after { content: "Anthropic: Claude v2 (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-haiku"]::after { content: "Anthropic: Claude 3 Haiku"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-haiku:beta"]::after { content: "Anthropic: Claude 3 Haiku (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-opus"]::after { content: "Anthropic: Claude 3 Opus"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-opus:beta"]::after { content: "Anthropic: Claude 3 Opus (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-sonnet"]::after { content: "Anthropic: Claude 3 Sonnet"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3-sonnet:beta"]::after { content: "Anthropic: Claude 3 Sonnet (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3.5-sonnet"]::after { content: "Anthropic: Claude 3.5 Sonnet"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-3.5-sonnet:beta"]::after { content: "Anthropic: Claude 3.5 Sonnet (self-moderated)"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-instant-1"]::after { content: "Anthropic: Claude Instant v1"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-instant-1.0"]::after { content: "Anthropic: Claude Instant v1.0"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-instant-1.1"]::after { content: "Anthropic: Claude Instant v1.1"; }
.timestamp[title^="openrouter"][title$="anthropic/claude-instant-1:beta"]::after { content: "Anthropic: Claude Instant v1 (self-moderated)"; }
.timestamp[title^="openrouter"][title$="austism/chronos-hermes-13b"]::after { content: "Chronos Hermes 13B v2"; }
.timestamp[title^="openrouter"][title$="cognitivecomputations/dolphin-llama-3-70b"]::after { content: "Dolphin Llama 3 70B"; }
.timestamp[title^="openrouter"][title$="cognitivecomputations/dolphin-mixtral-8x22b"]::after { content: "Dolphin 2.9.2 Mixtral 8x22B"; }
.timestamp[title^="openrouter"][title$="cognitivecomputations/dolphin-mixtral-8x7b"]::after { content: "Dolphin 2.6 Mixtral 8x7B"; }
.timestamp[title^="openrouter"][title$="cohere/command"]::after { content: "Cohere: Command"; }
.timestamp[title^="openrouter"][title$="cohere/command-r"]::after { content: "Cohere: Command R"; }
.timestamp[title^="openrouter"][title$="cohere/command-r-plus"]::after { content: "Cohere: Command R+"; }
.timestamp[title^="openrouter"][title$="databricks/dbrx-instruct"]::after { content: "Databricks: DBRX 132B Instruct"; }
.timestamp[title^="openrouter"][title$="deepseek/deepseek-chat"]::after { content: "DeepSeek-V2 Chat"; }
.timestamp[title^="openrouter"][title$="deepseek/deepseek-coder"]::after { content: "DeepSeek-Coder-V2"; }
.timestamp[title^="openrouter"][title$="fireworks/firellava-13b"]::after { content: "FireLLaVA 13B"; }
.timestamp[title^="openrouter"][title$="google/gemini-flash-1.5"]::after { content: "Google: Gemini Flash 1.5"; }
.timestamp[title^="openrouter"][title$="google/gemini-pro"]::after { content: "Google: Gemini Pro 1.0"; }
.timestamp[title^="openrouter"][title$="google/gemini-pro-1.5"]::after { content: "Google: Gemini Pro 1.5"; }
.timestamp[title^="openrouter"][title$="google/gemini-pro-vision"]::after { content: "Google: Gemini Pro Vision 1.0"; }
.timestamp[title^="openrouter"][title$="google/gemma-2-27b-it"]::after { content: "Google: Gemma 2 27B"; }
.timestamp[title^="openrouter"][title$="google/gemma-2-9b-it"]::after { content: "Google: Gemma 2 9B"; }
.timestamp[title^="openrouter"][title$="google/gemma-2-9b-it:free"]::after { content: "Google: Gemma 2 9B (free)"; }
.timestamp[title^="openrouter"][title$="google/gemma-7b-it"]::after { content: "Google: Gemma 7B"; }
.timestamp[title^="openrouter"][title$="google/gemma-7b-it:free"]::after { content: "Google: Gemma 7B (free)"; }
.timestamp[title^="openrouter"][title$="google/gemma-7b-it:nitro"]::after { content: "Google: Gemma 7B (nitro)"; }
.timestamp[title^="openrouter"][title$="google/palm-2-chat-bison"]::after { content: "Google: PaLM 2 Chat"; }
.timestamp[title^="openrouter"][title$="google/palm-2-chat-bison-32k"]::after { content: "Google: PaLM 2 Chat 32k"; }
.timestamp[title^="openrouter"][title$="google/palm-2-codechat-bison"]::after { content: "Google: PaLM 2 Code Chat"; }
.timestamp[title^="openrouter"][title$="google/palm-2-codechat-bison-32k"]::after { content: "Google: PaLM 2 Code Chat 32k"; }
.timestamp[title^="openrouter"][title$="gryphe/mythomax-l2-13b"]::after { content: "MythoMax 13B"; }
.timestamp[title^="openrouter"][title$="gryphe/mythomax-l2-13b:extended"]::after { content: "MythoMax 13B (extended)"; }
.timestamp[title^="openrouter"][title$="gryphe/mythomax-l2-13b:nitro"]::after { content: "MythoMax 13B (nitro)"; }
.timestamp[title^="openrouter"][title$="gryphe/mythomist-7b"]::after { content: "MythoMist 7B"; }
.timestamp[title^="openrouter"][title$="gryphe/mythomist-7b:free"]::after { content: "MythoMist 7B (free)"; }
.timestamp[title^="openrouter"][title$="huggingfaceh4/zephyr-7b-beta:free"]::after { content: "Hugging Face: Zephyr 7B (free)"; }
.timestamp[title^="openrouter"][title$="jondurbin/airoboros-l2-70b"]::after { content: "Airoboros 70B"; }
.timestamp[title^="openrouter"][title$="lizpreciatior/lzlv-70b-fp16-hf"]::after { content: "lzlv 70B"; }
.timestamp[title^="openrouter"][title$="lynn/soliloquy-l3"]::after { content: "Lynn: Llama 3 Soliloquy 8B v2"; }
.timestamp[title^="openrouter"][title$="mancer/weaver"]::after { content: "Mancer: Weaver (alpha)"; }
.timestamp[title^="openrouter"][title$="meta-llama/codellama-34b-instruct"]::after { content: "Meta: CodeLlama 34B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/codellama-70b-instruct"]::after { content: "Meta: CodeLlama 70B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-2-13b-chat"]::after { content: "Meta: Llama v2 13B Chat"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-2-70b-chat"]::after { content: "Meta: Llama v2 70B Chat"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-70b"]::after { content: "Meta: Llama 3 70B (Base)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-70b-instruct"]::after { content: "Meta: Llama 3 70B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-70b-instruct:nitro"]::after { content: "Meta: Llama 3 70B Instruct (nitro)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-8b"]::after { content: "Meta: Llama 3 8B (Base)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-8b-instruct"]::after { content: "Meta: Llama 3 8B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-8b-instruct:extended"]::after { content: "Meta: Llama 3 8B Instruct (extended)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-8b-instruct:free"]::after { content: "Meta: Llama 3 8B Instruct (free)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3-8b-instruct:nitro"]::after { content: "Meta: Llama 3 8B Instruct (nitro)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3.1-405b-instruct"]::after { content: "Meta: Llama 3.1 405B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3.1-70b-instruct"]::after { content: "Meta: Llama 3.1 70B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3.1-8b-instruct"]::after { content: "Meta: Llama 3.1 8B Instruct"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-3.1-8b-instruct:free"]::after { content: "Meta: Llama 3.1 8B Instruct (free)"; }
.timestamp[title^="openrouter"][title$="meta-llama/llama-guard-2-8b"]::after { content: "Meta: LlamaGuard 2 8B"; }
.timestamp[title^="openrouter"][title$="microsoft/phi-3-medium-128k-instruct"]::after { content: "Phi-3 Medium 128K Instruct"; }
.timestamp[title^="openrouter"][title$="microsoft/phi-3-medium-128k-instruct:free"]::after { content: "Phi-3 Medium 128K Instruct (free)"; }
.timestamp[title^="openrouter"][title$="microsoft/phi-3-medium-4k-instruct"]::after { content: "Phi-3 Medium 4K Instruct"; }
.timestamp[title^="openrouter"][title$="microsoft/phi-3-mini-128k-instruct"]::after { content: "Phi-3 Mini 128K Instruct"; }
.timestamp[title^="openrouter"][title$="microsoft/phi-3-mini-128k-instruct:free"]::after { content: "Phi-3 Mini 128K Instruct (free)"; }
.timestamp[title^="openrouter"][title$="microsoft/wizardlm-2-7b"]::after { content: "WizardLM-2 7B"; }
.timestamp[title^="openrouter"][title$="microsoft/wizardlm-2-8x22b"]::after { content: "WizardLM-2 8x22B"; }
.timestamp[title^="openrouter"][title$="mistralai/codestral-mamba"]::after { content: "Mistral: Codestral Mamba"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct"]::after { content: "Mistral: Mistral 7B Instruct"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct-v0.1"]::after { content: "Mistral: Mistral 7B Instruct v0.1"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct-v0.2"]::after { content: "Mistral: Mistral 7B Instruct v0.2"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct-v0.3"]::after { content: "Mistral: Mistral 7B Instruct v0.3"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct:free"]::after { content: "Mistral: Mistral 7B Instruct (free)"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-7b-instruct:nitro"]::after { content: "Mistral: Mistral 7B Instruct (nitro)"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-large"]::after { content: "Mistral Large"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-medium"]::after { content: "Mistral Medium"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-nemo"]::after { content: "Mistral: Mistral Nemo"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-small"]::after { content: "Mistral Small"; }
.timestamp[title^="openrouter"][title$="mistralai/mistral-tiny"]::after { content: "Mistral Tiny"; }
.timestamp[title^="openrouter"][title$="mistralai/mixtral-8x22b"]::after { content: "Mistral: Mixtral 8x22B (base)"; }
.timestamp[title^="openrouter"][title$="mistralai/mixtral-8x22b-instruct"]::after { content: "Mistral: Mixtral 8x22B Instruct"; }
.timestamp[title^="openrouter"][title$="mistralai/mixtral-8x7b"]::after { content: "Mixtral 8x7B (base)"; }
.timestamp[title^="openrouter"][title$="mistralai/mixtral-8x7b-instruct"]::after { content: "Mixtral 8x7B Instruct"; }
.timestamp[title^="openrouter"][title$="mistralai/mixtral-8x7b-instruct:nitro"]::after { content: "Mixtral 8x7B Instruct (nitro)"; }
.timestamp[title^="openrouter"][title$="neversleep/llama-3-lumimaid-70b"]::after { content: "Llama 3 Lumimaid 70B"; }
.timestamp[title^="openrouter"][title$="neversleep/llama-3-lumimaid-8b"]::after { content: "Llama 3 Lumimaid 8B"; }
.timestamp[title^="openrouter"][title$="neversleep/llama-3-lumimaid-8b:extended"]::after { content: "Llama 3 Lumimaid 8B (extended)"; }
.timestamp[title^="openrouter"][title$="neversleep/noromaid-20b"]::after { content: "Noromaid 20B"; }
.timestamp[title^="openrouter"][title$="nousresearch/hermes-2-pro-llama-3-8b"]::after { content: "NousResearch: Hermes 2 Pro - Llama-3 8B"; }
.timestamp[title^="openrouter"][title$="nousresearch/hermes-2-theta-llama-3-8b"]::after { content: "Nous: Hermes 2 Theta 8B"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-capybara-7b"]::after { content: "Nous: Capybara 7B"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-capybara-7b:free"]::after { content: "Nous: Capybara 7B (free)"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-hermes-2-mistral-7b-dpo"]::after { content: "Nous: Hermes 2 Mistral 7B DPO"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-hermes-2-mixtral-8x7b-dpo"]::after { content: "Nous: Hermes 2 Mixtral 8x7B DPO"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-hermes-2-mixtral-8x7b-sft"]::after { content: "Nous: Hermes 2 Mixtral 8x7B SFT"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-hermes-llama2-13b"]::after { content: "Nous: Hermes 13B"; }
.timestamp[title^="openrouter"][title$="nousresearch/nous-hermes-yi-34b"]::after { content: "Nous: Hermes 2 Yi 34B"; }
.timestamp[title^="openrouter"][title$="open-orca/mistral-7b-openorca"]::after { content: "Mistral OpenOrca 7B"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo"]::after { content: "OpenAI: GPT-3.5 Turbo"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-0125"]::after { content: "OpenAI: GPT-3.5 Turbo 16k"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-0301"]::after { content: "OpenAI: GPT-3.5 Turbo (older v0301)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-0613"]::after { content: "OpenAI: GPT-3.5 Turbo (older v0613)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-1106"]::after { content: "OpenAI: GPT-3.5 Turbo 16k (older v1106)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-16k"]::after { content: "OpenAI: GPT-3.5 Turbo 16k"; }
.timestamp[title^="openrouter"][title$="openai/gpt-3.5-turbo-instruct"]::after { content: "OpenAI: GPT-3.5 Turbo Instruct"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4"]::after { content: "OpenAI: GPT-4"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-0314"]::after { content: "OpenAI: GPT-4 (older v0314)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-1106-preview"]::after { content: "OpenAI: GPT-4 Turbo (older v1106)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-32k"]::after { content: "OpenAI: GPT-4 32k"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-32k-0314"]::after { content: "OpenAI: GPT-4 32k (older v0314)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-turbo"]::after { content: "OpenAI: GPT-4 Turbo"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-turbo-preview"]::after { content: "OpenAI: GPT-4 Turbo Preview"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4-vision-preview"]::after { content: "OpenAI: GPT-4 Vision"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4o"]::after { content: "OpenAI: GPT-4o"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4o-2024-05-13"]::after { content: "OpenAI: GPT-4o (2024-05-13)"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4o-mini"]::after { content: "OpenAI: GPT-4o-mini"; }
.timestamp[title^="openrouter"][title$="openai/gpt-4o-mini-2024-07-18"]::after { content: "OpenAI: GPT-4o-mini (2024-07-18)"; }
.timestamp[title^="openrouter"][title$="openchat/openchat-7b"]::after { content: "OpenChat 3.5 7B"; }
.timestamp[title^="openrouter"][title$="openchat/openchat-7b:free"]::after { content: "OpenChat 3.5 7B (free)"; }
.timestamp[title^="openrouter"][title$="openchat/openchat-8b"]::after { content: "OpenChat 3.6 8B"; }
.timestamp[title^="openrouter"][title$="openrouter/auto"]::after { content: "Auto (best for prompt)"; }
.timestamp[title^="openrouter"][title$="openrouter/flavor-of-the-week"]::after { content: "Flavor of The Week"; }
.timestamp[title^="openrouter"][title$="openrouter/null"]::after { content: "Use OpenRouter website settings"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3-sonar-large-32k-chat"]::after { content: "Perplexity: Llama3 Sonar 70B"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3-sonar-large-32k-online"]::after { content: "Perplexity: Llama3 Sonar 70B Online"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3-sonar-small-32k-chat"]::after { content: "Perplexity: Llama3 Sonar 8B"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3-sonar-small-32k-online"]::after { content: "Perplexity: Llama3 Sonar 8B Online"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3.1-sonar-large-128k-chat"]::after { content: "Perplexity: Llama 3.1 Sonar 70B"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3.1-sonar-large-128k-online"]::after { content: "Perplexity: Llama 3.1 Sonar 70B Online"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3.1-sonar-small-128k-chat"]::after { content: "Perplexity: Llama 3.1 Sonar 8B"; }
.timestamp[title^="openrouter"][title$="perplexity/llama-3.1-sonar-small-128k-online"]::after { content: "Perplexity: Llama 3.1 Sonar 8B Online"; }
.timestamp[title^="openrouter"][title$="phind/phind-codellama-34b"]::after { content: "Phind: CodeLlama 34B v2"; }
.timestamp[title^="openrouter"][title$="pygmalionai/mythalion-13b"]::after { content: "Pygmalion: Mythalion 13B"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-110b-chat"]::after { content: "Qwen 1.5 110B Chat"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-14b-chat"]::after { content: "Qwen 1.5 14B Chat"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-2-72b-instruct"]::after { content: "Qwen 2 72B Instruct"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-2-7b-instruct"]::after { content: "Qwen 2 7B Instruct"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-2-7b-instruct:free"]::after { content: "Qwen 2 7B Instruct (free)"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-32b-chat"]::after { content: "Qwen 1.5 32B Chat"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-4b-chat"]::after { content: "Qwen 1.5 4B Chat"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-72b-chat"]::after { content: "Qwen 1.5 72B Chat"; }
.timestamp[title^="openrouter"][title$="qwen/qwen-7b-chat"]::after { content: "Qwen 1.5 7B Chat"; }
.timestamp[title^="openrouter"][title$="recursal/eagle-7b"]::after { content: "RWKV v5: Eagle 7B"; }
.timestamp[title^="openrouter"][title$="recursal/rwkv-5-3b-ai-town"]::after { content: "RWKV v5 3B AI Town"; }
.timestamp[title^="openrouter"][title$="rwkv/rwkv-5-world-3b"]::after { content: "RWKV v5 World 3B"; }
.timestamp[title^="openrouter"][title$="sao10k/fimbulvetr-11b-v2"]::after { content: "Fimbulvetr 11B v2"; }
.timestamp[title^="openrouter"][title$="sao10k/l3-euryale-70b"]::after { content: "Llama 3 Euryale 70B v2.1"; }
.timestamp[title^="openrouter"][title$="sao10k/l3-stheno-8b"]::after { content: "Llama 3 Stheno 8B v3.3 32K"; }
.timestamp[title^="openrouter"][title$="snowflake/snowflake-arctic-instruct"]::after { content: "Snowflake: Arctic Instruct"; }
.timestamp[title^="openrouter"][title$="sophosympatheia/midnight-rose-70b"]::after { content: "Midnight Rose 70B"; }
.timestamp[title^="openrouter"][title$="teknium/openhermes-2-mistral-7b"]::after { content: "OpenHermes 2 Mistral 7B"; }
.timestamp[title^="openrouter"][title$="teknium/openhermes-2.5-mistral-7b"]::after { content: "OpenHermes 2.5 Mistral 7B"; }
.timestamp[title^="openrouter"][title$="togethercomputer/stripedhyena-hessian-7b"]::after { content: "StripedHyena Hessian 7B (base)"; }
.timestamp[title^="openrouter"][title$="togethercomputer/stripedhyena-nous-7b"]::after { content: "StripedHyena Nous 7B"; }
.timestamp[title^="openrouter"][title$="undi95/remm-slerp-l2-13b"]::after { content: "ReMM SLERP 13B"; }
.timestamp[title^="openrouter"][title$="undi95/remm-slerp-l2-13b:extended"]::after { content: "ReMM SLERP 13B (extended)"; }
.timestamp[title^="openrouter"][title$="undi95/toppy-m-7b"]::after { content: "Toppy M 7B"; }
.timestamp[title^="openrouter"][title$="undi95/toppy-m-7b:free"]::after { content: "Toppy M 7B (free)"; }
.timestamp[title^="openrouter"][title$="undi95/toppy-m-7b:nitro"]::after { content: "Toppy M 7B (nitro)"; }
.timestamp[title^="openrouter"][title$="xwin-lm/xwin-lm-70b"]::after { content: "Xwin 70B"; }
```

---

## 16. VN (Waifu) mode & character expressions

**Show only the last message in VN mode** (needs the `max-height` argument)
```
body.waifuMode div#sheld {
    height: fit-content;
    top: unset;
    display: flex;
    flex-direction: column;
}
body.waifuMode div#sheld > #chat {
    height: fit-content;
    max-height: calc(100vh - calc(var(--topBarBlockSize) + var(--bottomFormBlockSize)) - 9px);
    flex: 1 1 auto;
}
body.waifuMode div#sheld > #chat > .mes {
    display: none;
    &:nth-last-child(1 of :not(.navchat--hidden)) {
        display: flex;
    }
}
body.waifuMode div#sheld > #form_sheld {
    flex: 0 0 auto;
}
```

**Hide the Chat Top Info Bar extension in VN mode** (Small Potato — couldn't get a hover-reveal working)
```css
body.waifuMode #extensionTopBar {
    visibility: hidden;
}
```

**Character expressions to the top-left** instead of bottom-left (Wolfsblvt — same size/scaling)
```css
#expression-wrapper .expression-holder {
  top: 0;
  bottom: unset;
}
```

---

## 17. Backgrounds & decoration

**Page background only visible within the chat width** (Rivelle — fake effect; set *UI Background* opacity to 100 or adjust the colour)
```
#bg1::before,
#bg_custom::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--SmartThemeBlurTintColor);
    z-index: -1;
    mask-image: linear-gradient(
        to right,
        black 0,
        black calc((100% - var(--sheldWidth)) / 2),
        transparent calc((100% - var(--sheldWidth)) / 2),
        transparent calc((100% - var(--sheldWidth)) / 2 + var(--sheldWidth)),
        black calc((100% - var(--sheldWidth)) / 2 + var(--sheldWidth)),
        black 100%
    );
    -webkit-mask-image: linear-gradient(
        to right,
        black 0,
        black calc((100% - var(--sheldWidth)) / 2),
        transparent calc((100% - var(--sheldWidth)) / 2),
        transparent calc((100% - var(--sheldWidth)) / 2 + var(--sheldWidth)),
        black calc((100% - var(--sheldWidth)) / 2 + var(--sheldWidth)),
        black 100%
    );
}
```

**Lace decoration at the top of the page** (Rivelle, SVG from da-lace.com). Remove `transform: rotate(180deg);` to put it at the bottom; change `#72aed6` for colour; `opacity` 0.0–1.0; swap the SVG URL for other da-lace patterns.
```
body::before {
    content: "";
    position: absolute;
    top: -44.25%;
    left: 0;
    width: 100%;
    height: 100%;
    background-image:
        linear-gradient(#72aed6, #72aed6),
        url(http://da-lace.com/l/extra20_08/svg_extra20_08_5.svg);
    background-repeat: repeat-x;
    background-size: auto 100%;
    -webkit-mask-image: url(http://da-lace.com/l/extra20_08/svg_extra20_08_5.svg);
    -webkit-mask-repeat: repeat-x;
    -webkit-mask-size: auto 100%;
    mask-image: url(http://da-lace.com/l/extra20_08/svg_extra20_08_5.svg);
    mask-repeat: repeat-x;
    mask-size: auto 100%;
    pointer-events: none;
    transform: rotate(180deg);
    opacity: 0.7;
    z-index: -1;
}
```

**Dotted texture over the background** (Rivelle — other patterns: heropatterns.com, magicpattern.design; change `#bg_custom` for another target; adjust `z-index` for layering)
```
#bg_custom {
    filter: none !important;
}
#bg_custom::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23ffffff' fill-opacity='0.25' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 1;
    filter: none;
}
```
Mobile: these page-background effects appear to do nothing on mobile because the chat panel covers the page background there (Rivelle / Inspector Caracal). Squiddybobble's working mobile version of the texture:
```
body::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: var(--doc-height);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23ffffff' fill-opacity='0.25' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    z-index: -1;
    pointer-events: none;
}
```

**"Beer glass" chat background with rising bubbles** (MayzyDayz — written with ChatGPT; attachment `Beer_Glass_Effect_CSS.json` is a **CSS Snippet Manager** export, snippet name "Beer Effect", global). Snippet content:
```css
/* 🍺 Ultimate Beer Glass Chat Style — with Frost, Bubbles, Foam, Drips, and Refraction */

#chat {
  position: relative;
  z-index: 1;
  background: linear-gradient(
    to bottom,
    rgba(255, 233, 180, 0.1),   /* foam top */
    rgba(210, 140, 60, 0.15),   /* ale */
    rgba(80, 40, 20, 0.25)      /* roasted malt */
  );
  backdrop-filter: blur(10px) saturate(1.2) contrast(1.05);
  -webkit-backdrop-filter: blur(10px) saturate(1.2) contrast(1.05);
  border-radius: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  border-top: 4px solid rgba(255, 255, 255, 0.2); /* frothy rim */
  box-shadow:
    inset 0 0 30px rgba(0, 0, 0, 0.05),
    inset 0 0 12px rgba(255, 255, 255, 0.05); /* frost */
}

/* 🫧 Bubbles and foam layer */
#chat::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.3) 2px, transparent 2px),
    radial-gradient(circle, rgba(255, 255, 255, 0.2) 1.5px, transparent 1.5px),
    radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.08), transparent);
  background-size: 120px 200px, 80px 150px, 60px 100px, 100% 10%;
  background-repeat: repeat, repeat, repeat, no-repeat;
  animation: bubbleRise 30s linear infinite, foamFade 5s ease-in-out infinite alternate;
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
}

/* 💧 Drip trails and condensation */
#chat::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 10px 10px, 4px 30px;
  background-repeat: repeat, repeat-y;
  opacity: 0.1;
  z-index: 1;
  pointer-events: none;
  animation: dripTrail 20s linear infinite;
}

/* Bubbles rising */
@keyframes bubbleRise {
  0% {
    background-position: 0 100%, 50px 100%, 100px 100%, 0 0;
  }
  100% {
    background-position: 0 0, 50px 0, 100px 0, 0 0;
  }
}

/* Foam shimmer animation */
@keyframes foamFade {
  0% { opacity: 0.3; }
  100% { opacity: 0.45; }
}

/* Drip trail animation */
@keyframes dripTrail {
  0% { background-position: 0 0, 0 0; }
  100% { background-position: 0 100px, 0 100px; }
}
```
Snippet Manager wrapper fields (trimmed): `"name":"Beer Effect","isDisabled":false,"isGlobal":true,"themeList":[],"charList":[],"groupList":[]`.

**Custom dropdown arrows and slider thumbs with your own image** (angeldevii — fill the `url()`; add `filter: brightness(1) !important` if you dislike the fade in/out)
```
#extensionTopBarChatName,
#extensionConnectionProfilesSelect,
#extensionTopBarChatName, #extensionTopBarSearchInput, .drawer-content select{
background-image: url(); /* ur image url here */    
background-repeat: no-repeat;
background-position: right 6px center; /* tweak as needed */
background-size: 18px; /* ditto */
}
```
```
.neo-range-slider::-webkit-slider-thumb {
width: 20px !important; /* tweak as needed */
height: 20px !important; /* ditto */
background: url() no-repeat center center !important; /* ur image url here */
background-size: 20px 20px !important; /* tweak as needed */
border: none !important;
border-radius: 0% !important;
}
```

**Image overlay over the chat (Pip-Boy theme)** — posted only as a link to `📔┃ui-themes-chat`; Small Potato later showed it applied per-card via Creator's Notes `<style>` (§1).

---

## 18. Login screen & splash screen

### Login screen — goes in `/public/css/user.css`
Four accounts per row, wider popup:
```css
body.login #userList .userSelect { width: 20%; }

body.login #dialogue_popup {
    width: 800px;
}
```
Full-page large avatars, name on hover (LenAnderson — "put those high-res icons on display"):
```
/* custom styles for the login screen */
body.login {
    /* remove all the "popup" styling, just use the page itself */
    #dialogue_popup {
        width: unset;
        max-height: 100vh;
        max-width: 100vw;
        padding: 0;
        background: none;
        box-shadow: none;
        border: none;
    }
    #dialogue_popup_holder {
        padding: 0;
    }

    /* hide the "welcome" and "pick account" headers */
    #logoBlock, #normalLoginPrompt {
        display: none !important;
    }

    /* add some padding to the user list to allow for scale on hover */
    #userListBlock {
        padding: calc(min(25vw, 25vh) * 0.1);
    }

    /* a bit more vertical gap for the large avatars */
    #userList {
        column-gap: 5px;
        row-gap: 25px;
    }

    /* large avatars, size to 4 rows/cols */
    .userSelect {
        --size: calc(min(100vw, 100vh) * 0.8 * 0.25 - 5px);
        width: var(--size);
        position: relative;
        padding: 0;
        margin: 0;
        border: none;
        transition: 200ms;
        margin: 0 calc((25vw - 25px - var(--size)) / 2);

        &:hover {
            background-color: transparent;
            scale: 1.1;
            .userName {
                opacity: 1;
            }
        }

    }
    .avatar, .avatar img {
        height: auto;
        width: var(--size);
        aspect-ratio: 1;
        line-height: 0;
    }
    .avatar img {
        line-height: 0;
    }

    /* only show name on hover, place over avatar at bottom */
    .userName {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        font-weight: bold;
        text-shadow: 4px 6px 10px black;
        backdrop-filter: blur(10px);
        padding: 0.5lh 4px;
        transition: 200ms;
        opacity: 0;
    }

    /* don't show user handle (folder name) */
    .userHandle {
        display: none;
    }
}
```

### Splash / loading screen (Janet Vice, Apr 2026)
Replace the ST logo with any image:
```
.splash-screen::before {
  content: '';
  display: block;
  width: 640px;
  height: 300px;
  background-image: url('URL OF ANY IMAGE YOU WANT');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.splash-logo {
  display: none;
}
```
Replace the spinning cog with another Font Awesome glyph (unicode from fontawesome.com):
```
#load-spinner::before {
  content: "\f6ad";
}
```
Replace the "loading" text:
```
.splash-message {
  font-size: 0;
}

.splash-message::before {
  content: "ANY TEXT YOU LIKE";
}
```

---

## 19. Regex + CSS: styled "skill check" chips (Rivelle)

Uses a **Regex extension** script to replace a plain-text marker the LLM writes with styled HTML, instead of having the LLM emit HTML/CSS.
- **Pros:** saves context tokens (vs. LLM-generated HTML), avoids layout breakage from complex outputs, lightweight per-message styling.
- **Cons:** regex is hard to manage with many patterns; earlier caused lag in a PWA (unsure if still true). May break layout on mobile. Check it doesn't conflict with your other regexes.
- Test string: `[ Check: Acrobatics - Difficulty: 25 ... Roll: 16 - Result: Failure! ]`

Attachment `help_help.json` (retrieved, inlined; import via the Regex extension):
```json
{
    "id": "25b44a52-25b2-434b-8c83-179ead7f7948",
    "scriptName": "help help",
    "findRegex": "/\\[\\s*Check:\\s*(.+?)\\s*-\\s*Difficulty:\\s*(\\d+)\\s*\\.\\.\\.\\s*Roll:\\s*(\\d+)\\s*-\\s*Result:\\s*(.+?)\\s*\\]/g",
    "replaceString": "<style>\n        .skill-check-container {\n            width: 100%;\n            max-width: 800px;\n            text-align: center;\n            position: relative;\n            display: flex;\n            justify-content: center;\n            align-items: center;\n        }\n\n        .skill-check {\n            background: rgba(255, 255, 255, 0.1);\n            border-radius: 25px;\n            padding: 5px 15px;\n            width: fit-content;\n            display: inline-flex;\n            align-items: center;\n            gap: 8px;\n            position: relative;\n            overflow: hidden;\n            border: 1px solid rgba(255, 255, 255, 0.1);\n            line-height: 1;\n        }\n\n        .skill-check:before {\n            content: '';\n            position: absolute;\n            bottom: 0;\n            left: 0;\n            right: 0;\n            height: 1px;\n            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);\n        }\n\n        .dice-icon {\n            font-size: 18px;\n            transform: rotate(15deg);\n            color: #9ed0ff;\n            text-shadow: 0 0 10px rgba(158, 208, 255, 0.5);\n            display: inline-block;\n            position: relative;\n            top: -1px;\n        }\n\n        .challenge-type {\n            font-weight: 600;\n            color: #9ed0ff;\n            margin-right: 4px;\n        }\n\n        .difficulty {\n            color: #ff9e9e;\n            font-weight: 700;\n        }\n\n        .roll-result {\n            font-weight: 700;\n            color: #ffffff;\n            text-shadow: 0 0 8px rgba(255, 255, 255, 0.7);\n        }\n\n        .outcome {\n            font-weight: 700;\n            color: #ff6b6b;\n            animation: pulse 2s infinite;\n        }\n\n        @keyframes pulse {\n            0% {\n                text-shadow: 0 0 5px rgba(255, 107, 107, 0.5);\n            }\n            50% {\n                text-shadow: 0 0 15px rgba(255, 107, 107, 0.8);\n            }\n            100% {\n                text-shadow: 0 0 5px rgba(255, 107, 107, 0.5);\n            }\n        }\n\n        .separator {\n            margin: 0 6px;\n            opacity: 0.6;\n        }\n    </style>\n\n<div class=\"skill-check-container\">\n<div class=\"skill-check\">\n<i class=\"fa-solid fa-dice dice-icon\"></i>\n<span class=\"challenge-type\">$1</span>\nCheck - Difficulty: \n<span class=\"difficulty\">$2</span>\n<span class=\"separator\">...</span>\nYou roll: \n<span class=\"roll-result\">$3</span>\n- \n<span class=\"outcome\">$4!</span>\n</div>\n</div>",
    "trimStrings": [],
    "placement": [
        1,
        2
    ],
    "disabled": false,
    "markdownOnly": true,
    "promptOnly": false,
    "runOnEdit": true,
    "substituteRegex": 0,
    "minDepth": null,
    "maxDepth": null
}
```
Key settings: placement `[1, 2]` (user input + AI output), **Markdown only** (display-only, the prompt keeps the plain text), run on edit.

Related (Inspector Caracal, on Rivelle's theme): styling the `p` elements as bubbles instead of `.mes_text` is how multiple bubbles per message are achieved.

---

## 20. From the comments — gotchas, fixes, Q&A

**Applying CSS / where it goes**
- "I pasted it and nothing changed" (hrt, re: lace/texture) — on **mobile** the chat panel hides the page background; use Squiddybobble's `body::after` version (§17).
- HTML/CSS not rendering in chat (e.g. `<details>` collapsibles) — Jeff: **disable** *User Settings → Show `<tags>` in responses*.
- Per-character without editing global CSS: Creator's Notes `<style>` (§1) or `.mes[ch_name="…"]` / `body:has(.mes[ch_name="…"])`.
- A way to use `{{char}}` in CSS? Not answered directly; curator pointed to the per-character selectors above and to `📔┃ui-themes-chat`.
- Scoping: RossAscends/LenAnderson — only scope to `body.bubblechat` if you really mean bubble style; a bare `.mes` rule hits every chat style.
- Mobile rule of thumb (IceFog): wrap custom rules in `@media screen and (max-width: 1000px)` or override `mobile-styles.css`.
- "Can I see them all without scrolling?" — pinned GitHub compilation (§0), and Discord now supports searching within a thread (e.g. search "mobile").

**Locked out by CSS**
- Beamer boy hid the top bar with Wicked_ali's hover snippet and couldn't open settings. Fix (Wolfsblvt): edit `data/<user>/settings.json` → `"custom_css"`, back up first, keep JSON valid, reload. (Likely cause: the posted hover selector is missing `#` — see §9.)

**Version changes / outdated**
- Square avatars — now ST default.
- Quoted italics colour — ST (Feb 2025) switched default; use the `--SmartThemeEmColor` snippet to revert (§3).
- Focus outlines on inputs arrived in Jun 2024 (§14).
- guestavius's wrap-under-avatar snippet was adjusted in Oct 2024 after ST's swipe arrows got smaller.
- Carsten's top-bar text menu is incompatible with the Discord theme.
- Model-name list is frozen at mid-2024 model ids.
- Favourites carousel: Chromium only (`::scroll-button`).

**Known broken/odd bits in posted snippets** (kept verbatim above, flagged inline): blockquote nested `q` and collapse-hidden-messages missing a closing brace; `display: visibility;` in Rivelle's mobile QR; `class:` property in Maggotkin's wand menu; `top-settings-holder:hover` missing `#`; Nemuri's non-existent `--topBarBlockSize-500px`; Ren's `oncontextmenu` line; Squiddybobble's copy-icon placeholder missing `]`.

**Thread etiquette** — Wolfsblvt / curator: this thread collects finished snippets; questions and CSS building go to `📔┃ui-themes-chat`. Cohee's view: the guide "needs to be a link to CSS tutorial + devtools crash course" — learn F12 devtools to find selectors (Rivelle's Prompt Manager recipe shows the workflow).

---

## 21. Links & resources

- Thread: <https://discord.com/channels/1100685673633153084/1226855443586879519>
- Compiled mirror of the thread (Claude-generated, pinned): <https://github.com/luma-inibitor/st-notes/blob/main/ST_discord_CSS_snippets.md>
- Font Awesome icons (copy the unicode): <https://fontawesome.com/icons>
- Wrap-under-avatar original source: <https://momoura.neocities.org/>
- Model display names source: <https://rentry.org/tavern-model-names>
- Lace SVGs: <http://da-lace.com/> · background patterns: <https://heropatterns.com/>, <https://www.magicpattern.design/tools/css-backgrounds>
- `text-align: justify-all` explainer (asked "what does justify all text do"): <https://stackoverflow.com/questions/43427205/what-is-text-align-justify-all>
- highlight.js themes CDN (used by zerofata): `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/…`
- Rivelle's sample banner image: <https://iili.io/2srZJGR.png>
- Rivelle's per-character message styling post with guide + Canva template: `🌆・themes` forum, "Individual Character Message St…" (title truncated in export)

**Attachments (Discord CDN, signed URLs — may expire)**
- `model_name_barebones.css` / `model_name_full.css` (guestavius) — inlined in §15. <https://cdn.discordapp.com/attachments/1226855443586879519/1268667312387526796/model_name_barebones.css> · <https://cdn.discordapp.com/attachments/1226855443586879519/1268667312647442534/model_name_full.css>
- `help_help.json` (Rivelle, regex skill-check) — inlined in §19. <https://cdn.discordapp.com/attachments/1226855443586879519/1364678325334970368/help_help.json>
- `Beer_Glass_Effect_CSS.json` (MayzyDayz, Snippet Manager export) — inlined in §17. <https://cdn.discordapp.com/attachments/1226855443586879519/1374442772781596835/Beer_Glass_Effect_CSS.json>
- `SillyTavern-Icons.css` (Janet Vice) — inlined in §9. <https://cdn.discordapp.com/attachments/1226855443586879519/1463585870195196127/SillyTavern-Icons.css>
- `favs-carousel.css` / `Scroll-Favorites.css` (Janet Vice) — inlined in §11. <https://cdn.discordapp.com/attachments/1226855443586879519/1466058102410317980/favs-carousel.css> · <https://cdn.discordapp.com/attachments/1226855443586879519/1466085112134369301/Scroll-Favorites.css>

**Screenshots / media (not inlined)**
- Starter post screenshot of the Custom CSS box; IceFog options-on-hover demo; Carsten's text top bar; EvilFear top-bar order and hidden Custom CSS box; Wolfsblvt collapsible char-list filter GIF (`st_hide_charlist_filters_v2.gif`) and orange focus outline; Luccy's comment-tint and flashing proxy warning GIF; Inspector Caracal's text-messaging bubbles; Avery's edit-mode screenshots; login-screen 4-per-row; Small Potato's Creator's-Notes Pip-Boy example; Llynkurin's stacked QR sets; zerofata's code-block headers; Rivelle's banner messages (4 shots), character-page image, chat-width background, lace/texture, QR tight design and QR scrollbar, skill-check chips, Prompt Manager divider; samantha's avatar-reposition GIF; angeldevii's name taglines and custom dropdown/slider; Amby's name replacement; Belfonisis Flat-vs-Document comparison (3 shots); Nemuri's pixel-gap before/after; Janet Vice's icon set result and Font Awesome unicode location; Maggotkin's wand-menu video. All at `https://cdn.discordapp.com/attachments/1226855443586879519/…` in the thread.
- Some snippets were posted only as links to other channels/threads (Pip-Boy overlay, messenger-app layout, "give names fonts", "character card sizes", scrollbars in `sillytavern-feedback`) or as bare forwards with no content in the export — their CSS is not in this thread.
