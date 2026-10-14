# SillyTavern-Booru-Autocomplete — 2026-10-14 harvest
meta: https://github.com/Haek11/SillyTavern-Booru-Autocomplete · head `17d1b9b` · MIT (code); tag data MIT from HF
`newtextdoc1111/danbooru-tag-csv` (THIRD_PARTY_NOTICES.md) · read `index.js`, csv header, notices, README; skipped css, `tools/build_related.py` · new repo, no prior review

## What it is / what changed
Danbooru tag autocomplete in ST's image-gen "Review and edit the prompt" popup and the sd prompt settings fields. Ships
`danbooru_tags.csv` (32k tags: `tag,category,count,alias`, aliases include JP/other-language and slang). Prefix/alias/inner-word
match, colour by category, click a tag for co-occurrence %, custom snippets file. Pure client, no server plugin.

## How it works
- Data: csv loaded once by fetch (index.js:71-139); alias column maps variants to canonical tag.
- Target detection: `.popup-input` inside a popup that holds `#sd_refine_negative`/`#sd_use_saved_resolution`, plus fixed sd
  setting ids (index.js:22, 201-215).
- Dropdown floats as an overlay; handles `<dialog>` top layer and transformed parents for `position:fixed` (index.js:322-345, 356).
- Capture-phase keydown so Enter/Escape act on the list before the popup (index.js:570).

## Patterns for SO
### P1. Canonicalise director tags against a Danbooru vocabulary — feature · image route A · absent · value 3 · effort M
What: post-process the image director's comma tags: split, trim, `space<->underscore` fold, alias -> canonical, dedupe against
the quality block and route extras, drop tags whose category is artist (1), copyright (3), character (4) or meta (5).
Their evidence: csv columns `category`, `alias` (danbooru_tags.csv:1), alias lookup (index.js:31-32, 144-199).
Our state: route A models are Danbooru-trained (Illustrious, NoobAI: `src/image/catalog.ts:49-63`). The director is only told
"no names, ages, artist names or quality tags" (`src/image/prompt.ts:60-62`); `parseImageReply` keeps `prompt` verbatim
(`prompt.ts:91-112`) and `assembleImagePrompt` joins without dedupe (`prompt.ts:114-118`). Nothing in plan 41/29 covers a
vocabulary (`41-product-integration-and-image-models.md:23,65` only names route A as "SDXL tags").
Fit: pure function in `src/image/`, data in a lazy chunk (1.5 MB csv; a general+top-N subset is far smaller) to keep the main
bundle budget. Unknown tags kept (natural-language phrases still help SDXL), only blocked categories dropped. Data licence MIT
with attribution; Danbooru tag names. Measure first: count how often the director emits artist/character/duplicate tags on a
recorded set before building. Route B (Qwen edits) untouched.

### P2. Co-occurrence for missing companion tags — idea · image · absent · value 1 · effort M
Related-tag % (`tools/build_related.py`) could suggest `solo`/`1girl`-style count tags from visible cast. Our prompt already
asks "Count only visible people" (`prompt.ts:60`) and the cast is known; a deterministic count tag from `scene.subjects` is
simpler than co-occurrence. Skip unless P1's measurement shows count-tag misses.

## Host facts
- ST's image prompt review popup is a `.popup` `<dialog>` whose input is `.popup-input`, identified by the presence of
  `#sd_refine_negative` or `#sd_use_saved_resolution` (index.js:205-213). Relevant only if SO ever hooks ST's `/sd` review popup;
  SO's own routes go through ComfyUI directly.
- `position:fixed` inside a transformed ancestor is relative to it (index.js:335); matches our gotcha about `<html>`
  `translateZ(0)` and native `<dialog>`.

## Not worth taking
- The autocomplete UI itself: SO has no free-text tag field beyond `extraPositive`/`extraNegative` inputs
  (`src/image/ImageGroup.tsx:138-140`, `ImageChatPanel.tsx:48`); a user typing tags there is rare.
- Custom snippet triggers: route `extraPositive` already covers fixed additions.
