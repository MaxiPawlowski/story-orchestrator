---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1376373277320286258
thread_id: "1376373277320286258"
forum_tags: ["WorldInfo/Lorebooks", "Character Creation"]
author: "Lán Fāng"
created: 2025-05-26
last_activity: 2025-05-26
active_span_days: 0
upvotes: 1
reactions_total: 1
reactions: ["upvote 1"]
comments: 13
participants: 2
author_replies: 11
scraped: 2026-09-18
---
# SillyTavern — TwoList Card Templates (Character Cards and Built-in Lorebooks)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "TwoList Card Templates- Character Cards and Built-in Lorebooks"
<https://discord.com/channels/1100685673633153084/1376373277320286258>
**Author:** `Lán Fāng`
**Thread span:** 26 May 2025 (all 14 messages posted the same day, 01:36–05:49 UTC). Scraped 18 Sep 2026.

---

## 0. TL;DR — what this actually does

A hand-written character-card and lorebook **formatting convention** ("TwoList" for characters, "LoreList" for world/lore entries) meant to be reliably parsed by LLMs — the author built it while targeting **Gemini** specifically. Instead of prose-style trait descriptions, every entry is two parts: a compact pipe-delimited **Summary Line** for the essentials, followed by a comma-delimited **Detailed Keyword Block** — a big tag/keyword dump (aesthetics, kinks, themes, abilities, associated lore) the model can pattern-match against, closer to how Danbooru/e621 tagging works for image models than to normal character-card prose. It's a pure authoring convention: no extension, no code, no lorebook JSON to import — just a strict syntax to hand-write your card and lorebook entries in.

This thread is a single solo post (author explaining the format + one worked example), not a discussion — there was no community back-and-forth to draw fixes or corrections from.

---

## 1. TwoList — character card format

Each TwoList character card has two parts, in order: the **Summary Line**, then the **Detailed Keyword Block**, which must immediately follow it.

### 1.1 Part 1 — the Summary Line

Step by step, as written by the author:

1. **Begin with an opening bracket:** start the Summary Line with a single square opening bracket `[`.
2. **Field 1 — Character Identifier:** immediately after the bracket, write the character's primary identifier (e.g. `lastname, firstname` or `unique moniker` or `full name`). Follow with a single vertical pipe `|`.
3. **Field 2 — Age:** write the character's age (e.g. `22` or `ageless (appears 30s)`). Follow with `|`.
4. **Field 3 — Role/Occupation/Title:** state the character's main role or job. If you need specifics or a specialization, enclose that detail in parentheses `( )` within this field (e.g. `lead detective (cold case division)`). Follow with `|`.
5. **Subsequent fields — descriptors and lore:** add several short descriptive phrases or brief lore snippets. Each distinct piece of information (e.g. `piercing blue eyes`, `haunted by past failures`, `expert swordsman`) *must* be separated from the next by a single vertical pipe `|`. Keep these concise.
6. **End with a closing bracket:** after the last piece of information, close the Summary Line with a single square closing bracket `]`.

Structure:
```
[Identifier|Age|Role (Specialization)|Descriptor1|LoreSnippet1|Descriptor2]
```

### 1.2 Part 2 — the Detailed Keyword Block

Must immediately follow the character's Summary Line.

1. **Begin with an opening bracket:** start the block with a single square opening bracket `[`.
2. **Write the header line:** immediately after the bracket, type `# `, then the character's name or a recognizable variant, followed by a colon `:` (e.g. `[ # CharacterFirstName:` or `[ # Full Name:`).
3. **Start the keyword list:** following the header line (same line or a new line, for readability — not structurally required), type an opening parenthesis `(`.
4. **Add keywords and phrases:** list all relevant keywords, descriptors, personality traits, aesthetics, kinks, themes, abilities, etc. Each keyword or phrase *must* be separated from the next by a comma followed by a single space (e.g. `brooding, intelligent, leather jacket, ancient magic, moral ambiguity`). Keywords are generally lowercase, unless they're proper nouns or tags that conventionally use capitalization.
5. **Close the keyword list:** after the last keyword/phrase, type a closing parenthesis `)`.
6. **End with a closing bracket:** immediately after the closing parenthesis, close the block with a single square closing bracket `]`.

Structure:
```
[ # CharacterName:
(keyword one, phrase two, item three, another keyword.)]
```

### 1.3 Final checklist (author's own summary)

- One Summary Line per character.
- One Detailed Keyword Block per character, immediately following its Summary Line.
- Strictly use `|` to separate fields *within* the Summary Line.
- Strictly use `, ` (comma then space) to separate items *within* the parentheses of the Detailed Keyword Block.
- Ensure every opening `[` and `(` has a corresponding closing `]` and `)`.
- The header in the Keyword Block starts with `# ` and ends with `:` before the keyword list begins.

### 1.4 Worked example — Summary Line

```
[rirsh, icia|19|exchange student (occult studies)|pashtun features|central asian descent|olive skin tone|south asian male|cult survivor (multiple traditions)|accidentally summoned demon boyfriend Bhima|parents (Disciples of the Unblinking Eye) tried to kill him|Class SZ2 (Fu Zhou Academy)|struggles balancing occult & academy life|fears past & Bhima's cultic influence]
```
(Note: this message carries a Discord "(editado)"/edited marker in the scrape; the text above is the final edited version.)

### 1.5 Worked example — Detailed Keyword Block

```
[ # icia rirsh:
(emo undercut, grey eyes, unkempt face, ripped uniform, sigil ring, slight build, easily bruised, acne skin, dark hair, gothic aesthetic, dark academia fashion, student uniform, teen boy, masculine, quiet aesthetic, mysterious gaze, soft features, angular jaw, youthful look, delicate features, slender body, dishevelled hair, unique fashion, hidden style, casual grunge, everyday magic, young male, moody photography, alt teen style, low contrast eyes, soft grunge, vulnerable, anxious, shy character, awkward teen, innocence, naive character, compulsive cleaning, cleanliness obsession, anxiety kink, submissive tendencies, reluctant obedience, accidental summoning/binding, accidental dominance (by bhima), fragile character, comfort kink, caretaking, past trauma, trauma recovery, nervous habits, self-consciousness, self-deprecation, overstimulation, touch aversion, unwanted contact, guilt kink, emotional vulnerability, soft moans, historical consent issues, body image issues, power imbalance, hidden desires, forbidden love, soul bond, blood kink (cult context: Bloodsworn, Mehr Khel), gentle dominance, vulnerable top, stockholm syndrome (mild), secretly powerful, hidden talents (silent spellcasting, shadow spirit interaction, mana sensitivity, soul-tethering knowledge), unique magic (mixed cultic knowledge), emotional depth, gay romance, queer character, demon boyfriend, bhima/icia, Fu Zhou Academy, Class SZ2 (Shen Zhou Ban Er), fantasy academy, character-driven, coming-of-age, lavender, poetry, gaming, moralistic, accidental powerful ritual, paranormal, spiritual resonance, dark fantasy, urban fantasy, friendship, self-discovery, young adult, literary fiction, magical realism, mysterious past, witty dialogue, heartwarming, redemption, troubled teen, guarded, confused, troubled eyes, fresh face, unassuming, healing journey, unreliable narrator (internal), reluctant chosen one (fallen star's child).)]
```

This example illustrates the density the format expects: identity/appearance tags, personality tags, kink/theme tags, ability tags, and cross-references to other lore entries (`Fu Zhou Academy`, `Class SZ2`, `bhima/icia`) all flattened into one comma list.

---

## 2. LoreList — built-in-lorebook / world-info entry format

Same two-part shape as TwoList (Summary Line + Detailed Keyword Block), applied to lore elements instead of characters. Multiple lore entries are created by sequentially listing complete two-part entries one after another.

### 2.1 Part 1 — Summary Line construction

- **Mandatory enclosure:** enclose the entire Summary Line in one pair of square brackets: `[ Summary Line Content ]`.
- **Field delimiter:** use a single vertical pipe `|` to separate each field. No other delimiter is permitted.
- **Field 1 — Lore Identifier:** the primary identifier for the lore element (e.g. `Fu Zhou Academy`; `Class SZ2`; `Xylos (Demonic Realm)`).
- **Field 2 — Category/Type:** concisely defines the lore element's primary category or type (e.g. `Educational Institution`; `Special Cohort`; `Dimensional Location`). Parentheses `( )` are used within this field for sub-details or alternative names (e.g. `Organization (Parents' Cult)`).
- **Subsequent fields — key attributes & connections**, pipe-separated, must be one of:
  - **Core Attributes:** brief 1–3 word phrases describing essential characteristics or functions (e.g. `Unconventional Magic Focus`; `Rare Talent Program`; `High Demon Hierarchy`).
  - **Significant Connections/Lore Snippets:** concise descriptive phrases or sentence fragments linking to characters, plot points, or related lore (e.g. `Houses Class SZ2`; `Icia's accidental summoning criteria`; `Bhima's origin`).
- **Field conciseness:** every field in the Summary Line must be as brief as possible while conveying the necessary information.

### 2.2 Part 2 — Detailed Keyword Block construction

- **Mandatory enclosure:** the whole block sits inside one pair of square brackets: `[ Detailed Keyword Block Content ]`.
- **Header line:** immediately after the opening bracket, formatted precisely as `# LoreNameVariant:` (e.g. `[ # Fu Zhou Academy:`). `LoreNameVariant` should be a recognizable identifier for the lore element, followed by a colon.
- **Keyword list container:** immediately following the header line (often on a new line for clarity, not structurally required), the keyword list begins, enclosed in one pair of parentheses: `( keyword1, keyword2, phrase three )`.
- **Keyword/phrase content:** defining features, related concepts, thematic elements, associated characters/groups, origins, functions, locations, artifacts, etc.
- **Delimiter:** each keyword/phrase is separated from the next by a comma followed by a single space (e.g. `item one, item two, another item`). No other separator permitted.
- **Case:** keywords are generally lowercase, except proper nouns or conventionally-capitalized tags.
- **Termination:** the keyword list ends with a closing parenthesis `)`, immediately followed by the closing square bracket `]` that terminates the block (e.g. `...last keyword.)]`).

### 2.3 Strict adherence rules (author's own summary)

- The exact sequence of fields within the Summary Line must be maintained.
- The Summary Line must always precede its corresponding Detailed Keyword Block.
- All specified brackets, pipes, colons, commas, spaces, and parentheses must be used precisely as described — deviations are not permitted.

### 2.4 Worked example

```
[Fu Zhou Academy|Educational Institution (Magical)|Unconventional Magic Focus|Potent/Eccentric Graduates|Specialized Tracks (Ritualistics, Contained Dark Arts)|Houses Class SZ2|Location of Jingyu Quan (Well of Whispers)|Ancient Roots]
[ # Fu Zhou Academy:
(Zhou Fu - Talisman Incantation/Curse Academy, magical academy, higher education, unconventional curriculum, eccentric faculty, mysterious reputation, accepts volatile talents, ritualistics, dimensional theory, psycho-magical studies, contained dark arts, Jingyu Quan - Silent Whisper Spring, Academy Oracle site, deep magical foundation, produces powerful mages, Class SZ2 host, setting, institution, ancient knowledge, sigil magic, symbolic magic, ethical ambiguity).)]
```

Note this example's Summary Line has 8 pipe-separated fields (identifier, category, then 6 attribute/connection fields) — more than the minimal 2-field structure diagram implies; the format allows as many trailing attribute/connection fields as needed.

---

## 3. Example character card (full demo)

The author posted a complete example character card built with this template, titled *"Fu Zhou Academy's Class SZ2"* — presumably combining a TwoList character entry (icia rirsh) with LoreList entries (Fu Zhou Academy, Class SZ2) in one card's data/lorebook, matching the worked examples above. It was shared only as a SillyTavern character-card PNG attachment (card data is embedded in the PNG, not retrievable as text from this scrape):

- `Fu_Zhou__Academys_Class_SZ2.card.png` — <https://cdn.discordapp.com/attachments/1376373277320286258/1376376518023839829/Fu_Zhou__Academys_Class_SZ2.card.png>

A second post the same day (05:49 UTC, ~4 hours later) shared what the author labeled a **"TwoList Character Creator Card!"** — read from context, this is very likely a SillyTavern character card configured as an in-chat assistant/helper for *writing* TwoList-formatted cards (a common Discord-guide pattern: ship a "creator" persona card alongside the spec), rather than another example of the format itself. Only an image attachment was posted, no accompanying text, so this inference could not be confirmed from the thread content:

- `IalRKhs.png` — <https://cdn.discordapp.com/attachments/1376373277320286258/1376437086650892288/IalRKhs.png>

Neither attachment is a text-ish format (`.png`), so contents were not fetched — only the links and the surrounding-message context are preserved here.

---

## 4. From the comments

None. This thread is a solo post — the author (`Lán Fāng`) wrote the TwoList spec, the LoreList spec, and two example/demo messages back to back, with no other user replying. The only other activity in the thread is an automated moderation notice (`SillyTavern Hivemind` bot, `Non-Standard Latin Characters` — 5 minute timeout against the author, presumably triggered by a diacritic in the display name or a message), which is server housekeeping, not guide content, and is omitted from the write-up above per the noise rules for this scrape.

---

## 5. Links & resources

- `Fu_Zhou__Academys_Class_SZ2.card.png` — <https://cdn.discordapp.com/attachments/1376373277320286258/1376376518023839829/Fu_Zhou__Academys_Class_SZ2.card.png> — full worked example character card (icia rirsh / Fu Zhou Academy) built with this template, as a SillyTavern card PNG. Not fetched (binary/PNG).
- `IalRKhs.png` — <https://cdn.discordapp.com/attachments/1376373277320286258/1376437086650892288/IalRKhs.png> — posted under the heading "TwoList Character Creator Card!"; likely an assistant card for authoring TwoList entries, unconfirmed. Not fetched (binary/PNG).
- `o35f1u.jpg` — <https://files.catbox.moe/o35f1u.jpg> — attachment on the automod bot's warning message; unrelated to the guide content, not fetched.
