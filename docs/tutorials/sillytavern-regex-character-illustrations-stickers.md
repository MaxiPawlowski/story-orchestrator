---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1342397452933664768
thread_id: "1342397452933664768"
forum_tags: ["Other"]
author: "Rivelle"
created: 2025-02-21
last_activity: 2025-11-17
active_span_days: 268
upvotes: 36
reactions_total: 37
reactions: ["upvote 36", "💖 1"]
comments: 28
participants: 5
author_replies: 18
scraped: 2026-09-18
---
# SillyTavern — Using Regex to Insert Character Illustrations/Stickers in Chats

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Using Regex to Insert Character Illustrations/Stickers in Chats"
<https://discord.com/channels/1100685673633153084/1342397452933664768>
**Author:** `Rivelle`
**Thread spans:** 21 Feb 2025 (original guide + discussion) → 17 Nov 2025 (revived Q&A). Scraped 18 Sep 2026.

---

## TL;DR

A no-extension technique for making an LLM emit a structured `[Name : Expression | *Monologue*]` tag at the end of every reply, then using SillyTavern's built-in **Regex** extension to turn that tag into an HTML block that shows a character illustration/CG (picked by the `Expression` keyword) plus a styled inner-monologue caption. No custom code, no third-party extension — just a lorebook entry (prompt instructions) + a regex script (Global or Scoped) + optional custom CSS. Useful for anyone who already has a set of character CGs/expression sheets and wants them to appear automatically based on dialogue content, and more generally for building affection meters, RPG stat bars, SMS-style chat sims, or bilingual name display with the same regex-substitution approach.

---

## 1. Prerequisites

- Read the SillyTavern docs on the Regex extension first: <https://docs.sillytavern.app/extensions/regex/> — "The Regex extension lets the user automatically detect specific patterns in a strings of text (called 'sequences') and apply manipulations..."
- Have a responsive LLM with decent logical reasoning on hand — you'll lean on it both to follow the reply-format instructions in actual roleplay, and (separately) to help you write/debug the regex itself.

## 2. What regex can do (beyond this example)

Per the author, SillyTavern's regex extension can automate a lot without burning extra tokens:

- **Illustration/emoji replacement in character chats** — insert character illustrations or CGs automatically based on dialogue content (this guide's example).
- **Custom status fields** — affection meters, simulated Twitter/X replies, RPG level bars, even gacha/card-battle systems. ("I've even seen someone create a full gacha and card battle system... But honestly, if you're pulling off something that advanced, why not just make a dedicated extension?")
  - RPG stats/leveling can be built on top of World Info/Lorebooks.
- **Simulated chat scenarios** — e.g. SMS-style conversations.
- **Multi-language name display** — show a character's name in multiple languages for visual reference only, without touching what's actually sent as context. Example given: **Suou Tamaki** shown as **Suou Tamaki (須王環)** (from *Ouran High School Host Club*). Useful because not all LLMs handle multilingual input well.
  - For multilingual models, the author recommends putting a glossary directly in Worlds/Lorebooks for better terminology conversion.

---

## 3. Worked example: dynamic character illustrations/stickers

### 3.1 Motivation

- For "the OCD perfectionists out there."
- Some image-gen models only look good from certain angles — a pre-made illustration set sidesteps that entirely.
- If you already have nice CGs/backgrounds for a character, this shows them off during chat.
- Half-joking: "Truth be told, I'm just too lazy to mess with ComfyUI or manually remove image backgrounds."
  - Alternative: connect character-specific prompts to **Image Generation** directly via Image Prompt Templates if you'd rather generate on the fly.

### 3.2 Step 1 — place image files

Put your character illustrations in a folder such as:

```
/SillyTavern/data/default-user/characters/<CharacterName>/
```

The author used a character card (**Wyndham Nightshade**) that came with 70+ pre-made CGs from its creator, used here with the creator's permission, as a way of giving the set some real-world use.

Example path: `/SillyTavern/data/default-user/characters/Wyndham Nightshade`

(Screenshot of the character folder layout: <https://cdn.discordapp.com/attachments/1342397452933664768/1342399456418598985/2025-02-21_1.21.08.png> — link may be expired.)

### 3.3 Step 2 — edit Worlds/Lorebooks

Rather than editing your preset directly, put the reply-format instructions in a **World Info / Lorebook** entry — more flexible (per-character, importable/exportable, easy to disable).

#### (1) Reply Guidelines

Tell the LLM to strictly follow a reply format. The author's version (illustration keyword + inner monologue):

```
# Reply Guidelines
Every message from {{char}} must strictly follow the structure and format outlined below. Only the approved expression keywords may be used. The content should represent {{char}}'s most genuine inner thoughts, even if they remain unspoken.
Format:
[{{char}}: 1 Expression Keyword | *Concise inner monologue (1 sentence)*]
Example:
[{{char}}: neutral | *Why?*]
```

`{{char}}` is included specifically so this still works cleanly in group chats — it scopes the instruction to one character.

#### (2) Expression Keyword

A lorebook entry that just labels the keyword list, to keep the block organized:

```
Available Expression Keyword List:
```

#### (3) Character-specific CG emotion names

Put the character's name in the entry title so it's easy to manage per character, and use the **Filter to Characters or Tags** feature on the entry to scope it to just that character. Example keyword list used (Wyndham Nightshade, 70+ CGs, full list from the demo lorebook file):

```
admiring, angry1, angry2, annoyed, aroused, blushing shy1, blushing shy2, bored, childlike whining, comforted, confused1, confused2, contemptuous, coughing, crazy smiling, crying with eyes closed, crying with eyes open, curious, dazed, default, depressed1, depressed2, determined, disappointed1, disappointed2, disgusted, embarrassed1, embarrassed2, evil smiling1, evil smiling2, excited, fidgeting shy, flustered, forced smile1, forced smile2, full-face blush, giggling1, giggling2, guilty, happy smiling, indifferent, joyful, laughing, looking away shy, lovestuck, lustful1, lustful2, nervous pouting, nervous smiling, nervous1, nervous2, playful winking1, playful winking2, pouting, proud, relieved1, relieved2, sad, scared, seductive smiling, serious, shocked, smiling, smirking1, smirking2, smug1, smug2, sniggering, standing, surprised, suspicious, thinking, worried1, worried2
```

**Demo file** (importable directly into Worlds/Lorebooks): `WorldsLorebooks_Img_Input.json`, attached in-thread — <https://cdn.discordapp.com/attachments/1342397452933768/1342399797168046131/WorldsLorebooks_Img_Input.json> (signed link, may be expired). Successfully retrieved during scraping; it contains exactly the three lorebook entries described above:

| Entry | Comment | Content |
|---|---|---|
| 0 | "Wyndham Nightshade" | the full expression-keyword list above |
| 1 | "🔑｜Expression Keyword" | header line `Available Expression Keyword List:` |
| 2 | "💬｜Reply Guidelines" | the Reply Guidelines block above |

All three entries carry standard lorebook metadata (uid, order, position, probability, etc.) but no special trigger keys (`key: []`) — they're meant to be always-on / constant-style entries, not keyword-activated.

### 3.4 Step 3 — use Regex (the key step)

Once the previous steps are in place, the LLM's replies already contain the right *text* format, but nothing renders it as images/styled fields yet — that's the Regex extension's job.

Choose either:
- **Global Scripts** (all chats), or
- **Scoped Scripts** (attached to one character, exportable with the character card).

Target format: `[{{char}}: 1 Expression Keyword | *Concise inner monologue (1 sentence)*]`, rewritten as `[Name : Expression | *Monologue*]`. Three captures needed:

1. **name** — text from `[` to `:` (excluding `:`, spaces allowed)
2. **expression** — text from `:` to `|` (no trailing spaces or `|`)
3. **monologue** — text between the `*`s after `|` (excluding the `*`s)

Worked example: `[John : Hello | *Thinking*]` → name = `John`, expression = `Hello`, monologue = `Thinking`.

#### (1) Describing the requirements to an LLM

The author suggests using an LLM (they mention "ChatGPT (mini-3)" as an example, phrasing as given in the thread) to generate/refine the regex instead of hand-writing it, by clearly specifying:

- **Target format**, e.g. `[Name : Expression | *Monologue*]`
- **Capture elements**: name / expression / monologue as defined above
- **Output format**: named capturing groups, or numbered `$1, $2, $3` for use in "Replace With"
- **Global search**: whether to match with the `/g` flag

Prompt template used:

```
Write a regex to capture three parts from the following format:
- Format: [Name : Expression | *Monologue*]
- name: Text between "[" and ":" (allow spaces, but exclude ":").
- expression: Text between ":" and "|" (no trailing spaces or "|").
- monologue: Text between "*" after "|" (exclude "*").
- Use named capturing groups and support global search.
Example: [John : Hello | *Thinking*]
```

#### (2) Test and optimize

Paste the generated regex into the **Regex Editor** and turn on **Test Mode**. If matches are wrong, feed the LLM the actual test results and describe the fix needed, e.g.:

- *"The current regex captures trailing spaces in the expression. Please modify it to exclude the last space but allow spaces within the expression."*
- If only the first match in a message gets replaced, make sure the `/g` (global) flag is present.

Tip: keep the regex readable — if the logic gets complex, break it into simpler pieces and have the LLM combine them.

#### (3) The "Replace With" field

The author's actual working regex (retrieved from the thread's `Regex_face.json` attachment, fetched successfully):

**Find Regex:**
```
/\[\s*(?<name>[^:]+)\s*:\s*(?<expression>[^|]*[^\s|])\s*\|\s*\*(?<monologue>[^*]+)\*\s*\]/g
```

**Replace With:**
```html
<div class="char-info">
  <div class="char-name">$1</div>  
<div class="char-expression">
  <img class="origin-expression" src="/characters/$1/$2.webp" alt="Character expression">
  <img class="cover-image" src="https://iili.io/2tI25mJ.png" alt="Overlay image">
</div>
  <div class="char-monologue">$3</div>
</div>
```

Even though the Find Regex uses **named** capture groups (`?<name>`, `?<expression>`, `?<monologue>`), the Replace With field references them positionally as `$1`, `$2`, `$3` — SillyTavern's regex engine maps them through in order.

Field mapping:
- `$1` (name) → `div.char-name` text, and doubles as the folder name in the image path
- `$2` (expression) → image path `/characters/$1/$2.webp` — name the character's image folder after `$1` and drop `.webp` files named after each expression keyword inside; no path rewriting needed per-expression
- `$3` (monologue) → `div.char-monologue` text

**Full script export, other relevant fields** (from `Regex_face.json`):

```json
{
  "scriptName": "Face",
  "placement": [2],
  "disabled": false,
  "markdownOnly": true,
  "promptOnly": false,
  "runOnEdit": true,
  "substituteRegex": 0
}
```

`markdownOnly: true` means the substitution applies to the rendered/display text, not to what's sent back to the LLM as context — important, since the raw bracketed tag format is still what the LLM needs to see in chat history to keep following the Reply Guidelines.

**Regex export file** for direct import: `Regex_face.json`, attached in-thread — <https://cdn.discordapp.com/attachments/1342397452933664768/1342400279504748615/Regex_face.json> (signed link, may be expired; successfully retrieved during scraping, full contents reproduced above).

### 3.5 Step 4 — edit CSS (optional)

Not required, but the author spent real time here. Key gotchas:

- **Any class used in the Regex "Replace With" field gets a `custom-` prefix automatically.** `.char-info` in your HTML becomes `.custom-char-info` in the actual DOM — write your CSS selectors against the prefixed names. Do **not** manually type `custom-` into the Replace With field itself — that breaks it and just adds confusion.
- SillyTavern's Regex extension currently does **not** support inline `<style>` blocks inside the Replace With field. Use one of:
  - **User Settings → Custom CSS**, or
  - the **[CSS Snippets](https://github.com/LenAnderson/SillyTavern-CssSnippets)** extension for easier management.
- If you're exporting a character card for others, **do not** paste CSS into the Author's Note — it causes confusion for people who import the card.

**Full CSS used by the author:**

```css
#chat .custom-char-info {
    max-height: 300px;
    width: 100%;
    overflow: hidden;
    background-image:
        linear-gradient(to bottom, rgba(25, 118, 210, 0) 0%, rgba(25, 118, 210, 1) 100%),
        url("data:image/svg+xml,%3Csvg width='84' height='16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M78 7V4h-2v3h-3v2h3v3h2V9h3V7h-3zM30 7V4h-2v3h-3v2h3v3h2V9h3V7h-3zM10 0h2v16h-2V0zm6 0h4v16h-4V0zM2 0h4v16H2V0zm50 0h2v16h-2V0zM38 0h2v16h-2V0zm28 0h2v16h-2V0zm-8 0h6v16h-6V0zM42 0h6v16h-6V0z' fill='%23c20000' fill-opacity='0.77' fill-rule='evenodd'/%3E%3C/svg%3E");
    mask-image: linear-gradient(to bottom, black 65%, rgba(0,0,0,0) 100%);
    position: relative;
}

.custom-char-name {
  display: none;
}

.custom-char-expression {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    transform: rotate(-3deg);
}

.custom-origin-expression {
    z-index: 1;
    width: 100%;
    object-fit: contain; 
    transform: scale(0.6);
}

.custom-cover-image {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 2;
}

.custom-char-monologue {
    position: absolute;
    z-index: 3;
    bottom: 25px;
    right: 15px;
    max-width: 380px;
    background: rgba(0, 0, 0, 0.9);
    padding: 10px 15px;
    border-left: 8px solid rgb(25, 118, 210);
    font-size: small;
    color: #FFF;
    text-shadow: 0 1px 2px rgb(0, 0, 0);
    opacity: 0;
    transition: all 0.5s ease;
}

.custom-char-monologue:hover {
    right: 0;
    opacity: 1;
}
```

Effect: the character name is hidden (`display: none`), the illustration + overlay are shown rotated slightly for a "polaroid" feel, and the monologue text is a caption in the bottom-right corner that's hidden by default and fades in on hover.

---

## 4. Done — caveats and tips

> "Keep regex simple and avoid overly complex setups unless you only plan to chat with the same character" — unless, per the author, "you're already beyond saving."

- **Keep regex simple.** LLMs can struggle to hold a stable output format; an overly elaborate regex just means more manual fixing later.
- **PWA compatibility warning.** Using this kind of regex substitution on mobile PWAs may cause infinite-loading issues.
- **LLM stability matters.** A smarter model with better logical consistency will hold the format more reliably.

The author (not a native English speaker, by their own note) invited corrections/better phrasing from the thread — the replies below are what came of that.

---

## 5. From the comments

### 5.1 Reception (Feb 2025)
- `Leandro`: "This is amazing" — and specifically called out that it's achieved with **no custom extension**, just lorebook + regex.
- `Rivelle` (author), replying: it's a workable quick fix for chat edits, "not too much trouble," though he's a little wary it turns into a contest over "who's got the most extras." His actual takeaway: for AI roleplay, solid creative writing and logical reasoning from the model matter more than this kind of visual polish.
- `nara`: called it "the best one so far."

### 5.2 Extending it toward a full visual-novel system (Nov 2025 revival)

Thread was quiet for months, then picked back up:

- `Geh` said this lorebook+regex approach was the closest thing they'd found to what they wanted. They'd independently tried something similar roughly a year earlier but wrote **one regex per expression**, which they found totally infeasible at scale — routing everything through a lorebook entry (as in this guide) is what makes it tractable.
- `Geh`'s wider ask: a proper dedicated **VN (visual novel) extension**, and surprise that essentially no such extension exists beyond image-gen tooling.
- `Geh` described their own earlier, abandoned attempt in more detail: separate image folders per **clothing state** (`normal, underwear, naked, swimsuit, work`), plus folders for situations/locations — effectively building a kinetic-novel sprite system, where matching a text trigger would pull a random image from the appropriate folder and swap it into the chat. They gave up because it meant hand-writing a new regex for every folder/category.
- `Geh` then asked directly whether Rivelle had tried streamlining/expanding this method into something more like a built-in expression system, but more dynamic: unlimited slots, multiple example images per "expression," and expressions extended into a full sprite/avatar system that reacts to clothing/location changes.
- `Geh`'s framing of the distinction: this guide's method is closer to a general VN feel — specific text triggers cause a **pre-made image** to be inserted into the chat. It can drive whole **scenes**, not just per-character expressions or avatars. The catch, in Geh's assessment: it's necessarily a custom, bespoke setup for every character or chat (image sets have to be prepared and wired up per character).
- **No concrete follow-up guidance was given in the thread** — Rivelle's only replies to Geh's questions were emoji reactions (no text), so the "streamline into a proper VN system" idea is left as an open wishlist item, not a solved technique. Treat §5.2 as discussion/ideas, not a validated recipe.

---

## 6. Links & resources

- SillyTavern Regex extension docs — <https://docs.sillytavern.app/extensions/regex/> — official reference for the Regex extension used throughout this guide.
- CSS Snippets extension — <https://github.com/LenAnderson/SillyTavern-CssSnippets> — suggested alternative to User Settings → Custom CSS for managing the styling from §3.5.
- `WorldsLorebooks_Img_Input.json` — demo lorebook (Reply Guidelines + Expression Keyword header + full Wyndham Nightshade keyword list), Discord attachment, content reproduced in §3.3. Signed CDN link may have expired by the time you read this.
- `Regex_face.json` — the working regex script export (Find Regex + Replace With + full field set), Discord attachment, content reproduced in §3.4. Signed CDN link may have expired by the time you read this.
- In-thread screenshots (signed CDN links, likely expired): intro screenshot of the result in chat; character-folder layout; Worlds/Lorebooks editor view; Reply Guidelines/Expression Keyword lorebook entries; the regex-editor step; the CSS class-naming step; final result screenshot. None carried information beyond what's already transcribed above.
