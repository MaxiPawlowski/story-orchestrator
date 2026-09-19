---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1286355628314333335
thread_id: "1286355628314333335"
forum_tags: ["WorldInfo/Lorebooks", "Character Management", "Other", "UI Tweaks", "Character Creation"]
author: "wit"
created: 2024-09-19
last_activity: 2025-07-25
active_span_days: 309
upvotes: 20
reactions_total: 20
reactions: ["upvote 20"]
comments: 37
participants: 12
author_replies: 11
scraped: 2026-09-18
---
# SillyTavern — Community Quick Tips (compilation)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Community Quick Tips [contribute yours!]"
<https://discord.com/channels/1100685673633153084/1286355628314333335>
**Authors:** community thread — `wit` (thread starter, most tips), `Equinox Psychosis (Cas)`, `Goshenite`, `Wicked_ali`, `underscore_x #banana`, `NicoW`, `Giglio`, `Jeff`, `Shenanigans`, `Lán Fāng`, `deberias`, `ParaplegicRacehorse`
**Thread spans:** 19 Sep 2024 → 25 Jul 2025. Scraped 18 Sep 2026.

---

## TL;DR

A grab-bag "tip of the day" thread — no single narrative. Small, independent SillyTavern tips: macro tricks, sampler/generation settings, character-creation shortcuts, World Info tricks, regex snippets, and mobile/browser setup. Organized below by topic instead of chronologically, since each message is already a self-contained tip. Original ask from the thread starter (`wit`): "keep it tip format and not too conversational... edgy/whiny/bitchy/nsfw not welcome."

---

## 1. Macros & variables

- **`<bot>` / `<user>` vs `{{char}}` / `{{user}}`:** functionally the same, but `<bot>`/`<user>` can be nested *inside* other macros, e.g. `{{setvar::name::<user>}}` — `{{char}}`/`{{user}}` can't be nested that way. — `wit`
- **`{{getvar::variableName}}` works as a World Info keyword** — you can gate a WI entry's activation on a variable's value, not just literal chat text. — `wit`
- **World Info `automationId` doesn't have to be a number.** Instead of `"01"`, give it a real name like `"Do_Thing"` — makes it self-documenting when wiring up scripts. — `wit`
- **`{{trim}}` macro removes the newlines around whatever it wraps** when the prompt is sent. Framed as an accessibility tip (wrap prompt/lorebook text in extra blank lines to make it easier to read visually, then let `{{trim}}` strip them back out before sending) — also saves tokens either way. — `Equinox Psychosis (Cas)`
- **Multiple User Personas as a prompting shortcut:** instead of editing instructions into every character card, make a persona whose description carries behavior instructions, e.g. `{{user}} needs everything explained in simple, easy to understand steps.` Switch personas in and out when you want that behavior for a single reply — more efficient than adding/removing text from cards each time. — `wit`

---

## 2. Generation settings & samplers

- **"Trim incomplete sentences"** — Advanced Formatting panel (the **A** icon) — removes any half-finished sentence the model started but got cut off by the response-size limit. — `wit`
- **Don't stack multiple truncation samplers.** You don't need two or more of `Top P`, `Typical P`, `Min P`, `Top A`, `TFS` active at once — pick one, results are better. `Top K` is the exception: keep it active, set **80–200** (40–60 can work on some models). — `Equinox Psychosis (Cas)`
- **`Top K` as a performance lever:** keep it high in sampler priority order so the other (slower) samplers aren't scanning the full ~10,000-token distribution before doing their work. — `Equinox Psychosis (Cas)`
- **GGUF model repeating the same sentence over and over?** Repetition penalty is too high — above ~1.2 tends to make GGUF-format models degrade. Lower it. — `wit`

---

## 3. Character creation & management

- **Auto-write a first message via `/continue`:** start a new chat, click **Edit** on the message box, clear the text, and write a directive like:
  ```
  <Note: Write an introductory paragraph establishing {{char}} in (insert location and what they're doing).>
  ```
  Save, then hit **Continue**. The model writes the paragraph; copy it into the character's **First Message** field (or use it as an alternate greeting). Don't leave the `<>` note text itself in the saved message. — `Wicked_ali`
- **Accidentally closed the new-character tab mid-edit?** Nothing is lost — just click **New Character** again. — `wit` ([screenshot](https://cdn.discordapp.com/attachments/1286355628314333335/1286358095999664170/image.png) showing the character creation panel)
- **Hidden/private thoughts:** instead of backtick-fenced text for a character's thoughts, use `<>` to make them hidden-style thoughts instead. — `Equinox Psychosis (Cas)`
- **Location hub via tag folders (Character Management tab):** turn on **"show tags as folders"**, then make a tag represent a location (e.g. `School`) and set it to a **closed folder**; add that tag to every character who belongs there. For nested sub-locations (e.g. `School: Cafeteria`, `School: Auditorium`), make the parent location a closed folder and the sub-location tags **open folders**. Significantly declutters the character list and gives it a more gamified feel. — `Wicked_ali`

---

## 4. World Info tricks

- **Gate a WI entry by character or tag:** open a WI entry, scroll to **"Filter to character or Tags"** near the bottom, and type either a character's name or an existing tag name. The entry then only activates when generating for that character/tag. Example: a tag `Action (Genre)` tied to a WI entry `"Something suddenly happens! It is either exciting or chaotic!"`, set **always on**, **depth 2** (as a system message), **trigger probability 5%** — periodically injects a random beat for any character carrying that tag. **The WI entry's lorebook must be active** for the filter to matter. — `Wicked_ali`
- **Toggle a section of a WI entry on/off without the Codex extension**, using regex to strip a marked block. Wrap the optional text in matching sentinel lines:
  ```
  The Kingdom of Ordolin is one of the most prosperous kingdoms in Cyralden

  {{getvar::optional_section}}
  The Ordish people are little bitches.
  Total losers
  {{getvar::optional_section}}
  ```
  Regex (find), apply to **World Info**, leave "replace with" empty:
  ```
  /optional_section([\s\S]*?)optional_section/gm
  ```
  Hide the section with a Quick Reply running:
  ```
  /setvar key=optional_section optional_section
  ```
  Show it again with either:
  ```
  /flushvar optional_section
  ```
  or
  ```
  /setvar key=optional_section {{noop}}
  ```
  Rationale: useful when splitting into multiple lorebook entries is awkward (placement/position management on big lorebooks, or wanting the toggle mid-entry). — `underscore_x #banana`. Endorsed as "a very clever solution" by `Giglio`; `Jeff` asked whether the same approach works if you *do* have Codex — left unanswered in the thread.

---

## 5. Regex snippets

- **Normalize fancy/curly quotes to straight quotes** (works for any symbol substitution, not just quotes):
  - Find: `/[""]/g`
  - Replace with: `"`
  — `deberias`
- **Strip XML-style tags from output**, e.g. `<chat>...</chat>`:
  - Find: `/<\/?chat>/gsi`
  - Replace with: *(empty)*
  - Tick **"alter outgoing prompt"** on both regex scripts too, so the model itself never sees the tag either. — `deberias`

---

## 6. Reasoning / thinking-tag handling

- **Hide tags from your own view without deleting them from the message:** User Settings → **Chat/Message Handling** → toggle **"Show `<tags>` in responses"** off. — `deberias`
- **A thinking model's reasoning isn't collapsing into the normal reasoning dropdown** (e.g. it wraps reasoning in `<thinking>` instead of the tag ST expects): Advanced Formatting panel → scroll to **Reasoning** → **Reasoning Formatting** → change the **Prefix** and **Suffix** fields to match the actual tags your model emits. — `deberias`

---

## 7. Mobile & browser setup

- **Firefox showing a black background on a transparent PNG upload?** Hard-refresh with **Ctrl+F5**. — `wit`
- **Mobile layout gotcha:** on a phone browser (reported on Firefox), opening a character/group chat can make the description panel cover almost the whole screen, leaving only a thin strip to tap to dismiss it. Instead, **tap the character icon in the top bar** to close the description and return to the chat — works because the character-list view and character-description view are technically the same panel. This generalizes to the other top-bar toggle buttons too. — `NicoW`
- **Turn any ST URL into an app-like shortcut for more screen space:**
  - **Android — Hermit (Lite Apps Browser):** wraps the ST URL as its own app shortcut, avoiding mobile-browser chrome (tabs, address bar) and cutting RAM use. <https://play.google.com/store/apps/details?id=com.chimbori.hermitcrab> — `Shenanigans`
  - **Any Chromium/WebKit-based browser** (Edge, Brave, Chrome, Safari, Chromium, UnGoogled Chromium, etc.) can do the same natively via PWA install: open the stack-of-dots menu → **"Add to Home screen."** — `ParaplegicRacehorse`
  - **Samsung Internet** also supports PWAs/web-apps, plus it carries the system font, dark mode, and a high-contrast mode — useful for readability. — `Lán Fāng`
  - Community browser picks mentioned in the sub-thread: `Equinox Psychosis (Cas)` runs a **dedicated, extension-free Google Chrome** install solely for ST (chosen for reliability across ST + its extensions), and otherwise uses **Brave**. `Lán Fāng` uses **Fennec, Bromite, and Hermit**, noting Samsung Internet is otherwise the only usable browser for **Samsung DeX** or tablets. `Shenanigans` noted Firefox mobile has no kiosk-mode equivalent.

---

## 8. Extensions & discovery

- **There are more extensions than you'd expect** — check **📦・extensions** in the Discord regularly, especially anything made by `cohee` (ST's lead dev) or `len`. — `wit`
- **Character Expressions extension + Visual Novel mode:** for a more immersive feel, enable **Visual Novel mode** in User Settings alongside the expressions extension — on a phone this is close to required, since the character sprites only render with VN mode on. — `Goshenite`
- **QR (Quick Reply) editor autocompletes IDs/names as you type** — useful for finding the exact ID of a World Info file, WI entry, etc. without leaving the editor. — `wit` ([screenshot](https://cdn.discordapp.com/attachments/1286355628314333335/1287994138570264597/image.png) of the QR editor's autocomplete dropdown)
- **Staging vs. release branch:** if you're reading about a feature you don't have, you're likely on the `release` branch. Move to `staging` for the current/cutting-edge build — ask in the help channel for the switch procedure. — `wit`

---

## Links & resources

- Hermit — Lite Apps Browser (Google Play): <https://play.google.com/store/apps/details?id=com.chimbori.hermitcrab> — Android browser wrapper used to turn the ST web URL into an app-like shortcut with less browser chrome.
- Screenshot — character-creation tab recovery: <https://cdn.discordapp.com/attachments/1286355628314333335/1286358095999664170/image.png> (link may be expired; Discord CDN links rotate).
- Screenshot — GGUF repetition-penalty tip: <https://cdn.discordapp.com/attachments/1286355628314333335/1286360560530624654/image.png> (link may be expired).
- Screenshot — QR editor ID/name autocomplete: <https://cdn.discordapp.com/attachments/1286355628314333335/1287994138570264597/image.png> (link may be expired).

All three image attachments are plain screenshots illustrating the adjacent tip's text — no separate text/config attachments were posted in this thread.
