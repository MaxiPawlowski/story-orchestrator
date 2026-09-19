# Lorebook patterns (recipes)

Open this when you need a ready-made shape for a common job. Each recipe lists only the fields that
differ from `../templates/minimal-lorebook.json` entry `"0"`, which is a keyword entry at ↓Char with
order 100. Mechanics are source-verified. Craft advice is marked as community practice.

## 1. Keyword lore (places, people, items)

```json
{ "comment": "Place - Saltmere Docks", "key": ["saltmere docks", "the docks", "harbour", "harbor"], "position": 1, "order": 100 }
```

- List plural, alternate-spelling and short forms. Whole-words matching is exact per word
  (activation-internals.md §3).
- Content names its subject and stands alone. Nothing but `content` is sent.
- Let entries mention each other's keys so recursion pulls related lore in. The official doc's
  "Bessie → Rufus" example shows this. It only works when recursion is on, and it's **off on this
  install** (2026-09-18).
- Content style: the official doc recommends PLists for environments and PList + Ali:Chat for lore.
  LoreList (§10) is a community alternative.

## 2. Constant steering note (every turn, strong)

```json
{ "comment": "Style - Voice rules", "key": [], "constant": true, "position": 4, "depth": 4, "role": 0, "preventRecursion": true }
```

- Community practice (community-reported, 2024-09 to 2025-12, from the World Info getting-started
  thread): keep the card sparse and put what must hold every turn in a constant @D4 system entry. Lower depths are stronger. Use depth 0–2
  for formatting or immediate scene rules.
- `preventRecursion` stops an instruction's wording from triggering lore entries.

## 3. Checkpoint-gated entry (story phase; project pattern)

Author the entry constant and **disabled**. The story flips it at a boundary:

```json
{ "comment": "CP2 - Scenario", "key": [], "constant": true, "disable": true, "position": 0 }
```

```json
"effects": { "world_info": {
  "enable":  [{ "lorebook": "Xentar Checkpoints", "comments": ["CP2 - Mission", "CP2 - Scenario"] }],
  "disable": [{ "lorebook": "Xentar Checkpoints", "comments": ["CP1 - Mission", "CP1 - Scenario"] }]
} }
```

- Applied by `EffectsApplier.applyWorldInfo` (`src/runtime/effectsApplier.ts:63-78`). It accepts
  `lorebook` or `book`, and `comments` as a list or `comment` as a string. Entries are matched by
  trimmed `comment` (`src/services/stHost/worldInfo.ts:42-51`).
- Real example: `examples/sun-ruins/Xentar Checkpoints.json`. Its `CP*` entries are constant, most
  are disabled, and `examples/sun-ruins/quest-for-the-sun-ruins.json` enables them per checkpoint
  (the first effect is at line 112). The general lore in the same book is keyword-driven at ↓Char.
- Remember to **disable the previous phase's entries**. Nothing resets them for you.
- Toggling saves the book and changes the entry's hash, which clears any running sticky or cooldown
  on that entry.

## 4. Mutually exclusive variants (inclusion group)

```json
{ "comment": "Places - Sun Ruins", "key": ["sun ruins"], "group": "ruins" }
{ "comment": "Places - Moon Ruins", "key": ["moon ruins"], "group": "ruins" }
```

- Only one entry per label is inserted per generation.
- Pick the winner deterministically with `groupOverride: true` plus a higher `order`, or by weight
  with `groupWeight`.
- With group scoring on, the entry with the most matched keys wins. The official doc's song, sing,
  Black Cat and Ghosts example shows this.
- Handy for *fallback chains*: a generic entry and a specific entry share a group, and the specific
  one has more keys.

## 5. Random event beat, only for tagged characters (community quick tip, 2024-09)

```json
{ "comment": "Event - Action beat", "key": [], "constant": true, "position": 4, "depth": 2, "role": 0,
  "probability": 5, "useProbability": true,
  "characterFilter": { "isExclude": false, "names": [], "tags": ["<tag id of 'Action (Genre)'>"] },
  "content": "Something suddenly happens! It is either exciting or chaotic!" }
```

- `tags` holds **tag ids**, not names (`world-info.js:1420`). Set it through the UI ("Filter to
  Characters or Tags") or with `/setentryfield field=characterFilterTags Action (Genre)`, which
  resolves the name to an id for you.

## 6. Cadence with timed effects: "every N messages" (Seamless Image Gen v2 §4, corrected)

That guide's `_ImageGeneration.json` injects a marker instruction the model is told to append, so a
Quick Reply can react to it. Its working part:

```json
{ "comment": "Generate every 5 messages", "key": [], "constant": true, "position": 4, "depth": 1, "role": 1,
  "cooldown": 5, "delay": 5, "group": "IMGEN", "excludeRecursion": true, "preventRecursion": true,
  "content": "(OOC: Finish your response with %[1]" }
```

- Constant plus `cooldown: 5` fires once, then rests for 5 scan-chat messages. `delay: 5` keeps it
  quiet for the first 5. Sibling variants ("randomly": probability 20, "constantly": cooldown 1) share
  the group `IMGEN`, and only one ships enabled.
- **Corrections from the source:**
  - The guide says `role: 1` is assistant. **1 is user**; assistant is 2 (`index.html:7195-7200`).
  - Its `keysecondary: ["Your next response should only be the tags"]` with `selectiveLogic: 2`
    (NOT_ANY) is meant to hide the marker during the tag-prompt request. It **does nothing on a
    constant entry**, because constants skip all key checks (`world-info.js:4893-4897`, dry-run
    verified).
  - To keep the marker out of a quiet generation, either set
    `"triggers": ["normal","continue","swipe","regenerate"]` so `quiet` isn't included, or toggle
    the book around the call, as the community `cupcake` script does:
    `/world state=off silent=true _ImageGeneration | … /gen … | /world state=on silent=true _ImageGeneration`.
- Image-generation specifics (marker scripts, profile swapping) belong to the `st-image-generation` skill.

## 7. Scope an entry to one generation type

`"triggers": ["quiet"]` means the entry fires only in background or quiet generations: `/gen`, image
prompts, and extensions that use `generateQuietPrompt`. The reverse is every type except `quiet`.
This is the clean fix for the "tag lorebook bleeds into normal RP" side effect the tag-prompt author
left unsolved (community-reported, 2026-01). The mechanism is `world-info.js:4807-4813`, and
`generateQuietPrompt` runs as type `quiet` (`script.js:3108`). Caveat: other extensions' quiet calls,
such as Summarize, will see the entry too.

## 8. Natural-language keys, vocabulary content (general lesson from the tag-lorebook guide)

The key is how a scene *describes* something. The content is the exact term you want the model to use:

```json
{ "comment": "Tag - arm up", "key": ["raise arm", "raises her arm", "stretch", "stretches", "lift arm", "reach up"],
  "content": "danbooru tags: arm up, outstretched arm", "position": 4, "depth": 0, "triggers": ["quiet"] }
```

- Works for any controlled vocabulary: tags, house style terms, faction jargon.
- Add related terms to entries that fire unreliably (community-reported).
- The full image technique is in the `st-image-generation` skill.

## 9. Toggle part of an entry with a variable plus a regex (community quick tip, 2024-09)

Content:

```
The Kingdom of Ordolin is one of the most prosperous kingdoms in Cyralden.
{{getvar::optional_section}}
Optional paragraph here.
{{getvar::optional_section}}
```

- Add a regex script with **World Info** placement that finds
  `/optional_section([\s\S]*?)optional_section/gm` and replaces it with nothing.
- Hide: `/setvar key=optional_section optional_section`.
- Show: `/flushvar optional_section`.
- Why it works: content macros are substituted at activation (`world-info.js:5058`), and World Info
  regex runs only at insertion (`world-info.js:5205`).
- Side effect: **recursion still sees the hidden paragraph**, because the recursion buffer gets
  un-regexed content (`5139-5142`).
- The regex JSON format lives in the `st-scripting` skill.

## 10. LoreList content format (community convention, 2025-05, 1 upvote)

A dense, pipe-and-comma format for entry *content*. It was built for Gemini and hasn't been
benchmarked. It's optional; use it when you want compact, machine-parseable lore:

```
[Fu Zhou Academy|Educational Institution (Magical)|Unconventional Magic Focus|Houses Class SZ2|Ancient Roots]
[ # Fu Zhou Academy:
(magical academy, eccentric faculty, accepts volatile talents, ritualistics, contained dark arts, sigil magic, ethical ambiguity)]
```

- The first line is the summary: identifier, category, then any number of pipe-separated attributes
  and connections.
- The second is the keyword block: `[ # Name:` followed by `(comma, separated, keywords)]`.
- Brackets and delimiters are strict: `|` inside the summary, `, ` inside the parentheses. The
  author's example was trimmed here.
- The character-card sibling, TwoList, is covered by the `st-character-authoring` skill.

## 11. Outlet: put entries exactly where a template wants them

```json
{ "comment": "Outlet - Achievements", "key": ["achievement"], "position": 7, "outletName": "character-achievements" }
```

- Put `{{outlet::character-achievements}}` in any prompt field: the system prompt, a Prompt Manager
  prompt, the story string, or a card field. Every activated entry with that outlet name is joined
  there (`script.js:4674-4677`, `macros.js:668`, `macros/definitions/core-macros.js:450-465`).
- Nothing is inserted automatically.

## 12. Decorators (first lines of content)

```
@@activate
Always-on text that still obeys probability, groups and budget.
```

- `@@activate` forces activation after the disable, trigger, filter, timed and recursion gates have
  passed. `@@dont_activate` suppresses it (`world-info.js:4875-4884`).
- Decorator lines are removed from the inserted text. Decorators are parsed **before** macro
  substitution, so they can't be dynamic.

## 13. Match only one speaker's messages

The scan buffer puts `\x01` before each message (`world-info.js:295-297`). So
`/\x01{{user}}:[^\x01]*?hello/` fires only when the *user* says "hello". The official doc covers
this. It needs Include Names on.
