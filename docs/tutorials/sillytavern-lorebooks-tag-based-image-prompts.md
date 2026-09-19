---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1457934981992157224
thread_id: "1457934981992157224"
forum_tags: ["WorldInfo/Lorebooks", "Other"]
author: "Cap"
created: 2026-01-06
last_activity: 2026-01-07
active_span_days: 0
upvotes: 8
reactions_total: 8
reactions: ["upvote 8"]
comments: 6
participants: 1
author_replies: 6
scraped: 2026-09-18
---
# SillyTavern — Using Lorebooks for Tag-Based Image Generation Prompts (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Using Lorebooks for Tag Based Image Generation Prompts"
<https://discord.com/channels/1100685673633153084/1457934981992157224>
**Author:** `Cap` (all 7 messages)
**Thread spans:** 06 Jan 2026 → 07 Jan 2026 (single day, sequential posts by the same author, no other commenters).
Scraped 18 Sep 2026.

---

## 0. TL;DR — what this actually does

A trick for improving the **Image Generation** extension's auto-prompt-from-RP-context feature (the prose-to-prompt LLM call), specifically for **comma-delimited, tag-based** image models (NovelAI, PonyXL, anything trained on Danbooru-style tag sets). The core idea: an **active lorebook** whose entries fire on natural-language phrasing (e.g. "raise arm", "stretch") but whose *content* is the literal Danbooru tag(s) for that concept (e.g. `danbooru tags: arm up, outstretched arm`). Because ST's image-prompt-generation call can see active lorebook entries, the LLM starts using the *correct, specific, indexed* Danbooru tag instead of a vaguer paraphrase — producing measurably more accurate and consistent generations, especially for obscure poses/clothing/hairstyles that only render well under their exact tag.

Not a full image-gen setup guide — **assumes you already have the Image Generation extension and prompting pipeline working**. Tailored to NovelAI (trained on Danbooru) but the author states it should work for any comma-delimited tag-based model (PonyXL, etc.).

---

## 1. Prerequisites

- Working Image Generation extension + prompt pipeline (out of scope here).
- Start from this community image-prompt template (source, not reproduced verbatim by the thread author — follow the link):
  `https://www.reddit.com/r/SillyTavernAI/comments/1l8vn7i/novelai_v45_image_gen_showcase/`
  Credited in-thread to Reddit user **Leafcanfly** ("heavy lifting on the NAI prompt used here" — likely the same "Leaf" credited in the companion Seamless Image Generation guide).
- The author notes this template "sometimes struggles with specifics or more obscure or specific scenarios" — that gap is what the lorebook trick addresses.

---

## 2. Step 1 — tell the LLM to think in Danbooru tags

Add a line like this to your image-prompt template/instructions:

```
Always condense descriptions into comma delineated danbooru tags. Use danbooru lorebook for tags.
```

Author reports good results with this alone on **DeepSeek R1**, **DeepSeek V3.x**, **Gemini**, and **GPT-4**-and-later models. This single line "even ... can get you pretty far", but the lorebook step (below) goes further.

---

## 3. Step 2 — build a Danbooru-tag lorebook

Any **global or character lorebook** that's active during the image-prompt-generation call is visible to that LLM call, same as any other generation. So:

1. Create a lorebook.
2. **Primary Keywords** (the entry's trigger key(s)) = natural language a scene might use to describe the concept — e.g. "raise arm", "stretch", "stretches", "lift arm", "reach up".
3. **Entry content** = the literal tag(s), written as `danbooru tags: tag, tag, tag`.

**Example entry (verbatim from the thread):**
```
Primary Keywords: raise arm, stretch, stretches, lift arm, reach up

Context: danbooru tags: arm up, outstretched arm
```

Notes from the author:
- For tags that don't reliably trigger, add more surrounding context and related/alternate tags in the same entry — improves hit rate.
- You can add emphasis brackets (`{}`) to tags inside the entry content.
- Self-assessed as "not a lorebook expert" — the keyword lists can likely be tuned further than shown.

### 3.1 Finding tags to add

- **Artist tags:** browse `https://nax.moe/` — it generates SFW example images for every Danbooru artist tag with 225+ attached images. Blend influence across multiple artists using `[tag]` (de-emphasis, recommended) or `{tag}` (emphasis) brackets; author recommends mostly `[less]`.
- **General/pose/clothing tags:** browse Danbooru directly, and use the **Danbooru wiki** for tag context/descriptions (not linkable per Discord rules — "use your google-fu").
- **Danbooru wildcard search syntax** for tag discovery:
  - `*word` — tags **ending** in "word" (e.g. `long_arm`, `short_arm`)
  - `word*` — tags **starting with** "word" (e.g. `arm_up`, `arm_down`)
  - `*word*` — tags containing "word" **anywhere**

No off-the-shelf lorebook is provided in-thread; author floated sharing an SFW-tags-only lorebook later but nothing was posted as of the scrape.

---

## 4. Before/after example (author's own test)

Setup: identical SFW scenario generated once with the tag-lorebook **off** (control, "basic SFW AI RP slop prompt") and once **on**. Four screenshots were attached (image comparisons; not independently re-derivable from text — see §6).

**Lorebook off — generated prompt:**
```
1girl, jet black hair, long hair tied back, black oval glasses, oversized hoodie, baggy jeans, serious expression, standing in a t pose, centered composition, bedroom interior, messy room, scattered manga volumes, empty energy drink cans, faded rug, ceiling fan, dim lighting, best quality, masterpiece, amazing quality, absurdres
```

**Lorebook on — generated prompt:**
```
1girl, black hair, long hair, ponytail, glasses, oval glasses, pale skin, brown eyes, oversized hoodie, baggy jeans, sneakers, t-pose, blank expression, messy room, manga, energy drink cans, ceiling fan, rug, cluttered, indoors, best quality, masterpiece, amazing quality, absurdres
```

Key difference the author calls out: with the lorebook on, the model correctly used **`t-pose`** (the actual Danbooru tag) instead of the paraphrase **"standing in a t pose"**. T-pose is common enough that even the control run got close, but the author states this generalizes: for tags describing more obscure concepts that only exist as an indexed Danbooru tag, the gap between paraphrase and correct tag is much larger, and that's where the technique pays off most.

---

## 5. Side effect: tag-lorebook bleeding into normal chat

Because the lorebook stays active generally (not scoped only to the image-prompt call), the author observed it **also influences normal RP generation**, not just image prompts — explicitly seen surfacing in **DeepSeek's thinking/reasoning sections**. Assessed as low-impact ("only really comes up when it's relevant anyway") with the main cost being a **slightly higher token count**. Author speculates this could be fixed with lorebook scoping/settings but had not solved it as of the post ("that is currently beyond my knowledge").

---

## 6. Follow-up fix: lorebook entries were losing to the prompt template

Posted as a same-thread update the next day (07 Jan 2026), flagged by the author as boring-but-important.

**The problem:** Because of how ST orders context, lorebook entry content can only ever be inserted **before** the image-generation prompt template — never after. That template (per the reddit-sourced prompt in §1) opens with the literal text:

```
Ignore previous instructions
```

Since the lorebook content lands *before* that line, the template's own "ignore previous instructions" was wiping out the lorebook's tag guidance. Removing that opening line from the template entirely was tried, but made the template "more inconsistent as a whole" — not a good fix.

**The author's two-part fix:**

1. Set **every entry in the tag lorebook** to insertion **Position: `@D` (at depth)**, **Depth: `0`** — this pins the lorebook content immediately before the image prompt template, as close as possible to where it will actually be read.
2. Edit the image-prompt template's leading instruction from `"Ignore previous instructions"` to:
   ```
   Ignore all previous instructions that do not regard image generation
   ```
   This keeps the template's original "reset the conversational context" intent while explicitly carving out an exception for the lorebook's tag instructions that now sit directly above it.

Author's own characterization: "Janky pepegabrain ass solution", found after "extensive testing", but confirmed working — reported cleaner, more accurate prompts after applying it. Explicitly invites a more elegant fix if anyone has one; none was posted in this thread as of the scrape.

---

## 7. From the comments

None to report — every one of the 7 messages in this thread was posted by the original author (`Cap`) in sequence; no other Discord users replied. (One follow-up message from `Cap` is purely a reaction GIF, see §8.)

---

## 8. Links & resources

- Reddit — base image-prompt template this guide builds on: `https://www.reddit.com/r/SillyTavernAI/comments/1l8vn7i/novelai_v45_image_gen_showcase/` (credited to Reddit user Leafcanfly).
- `https://nax.moe/` — SFW example-image gallery for Danbooru artist tags with 225+ images each; used to pick/blend artist style tags.
- Danbooru wiki / tag search — referenced for tag research and wildcard search syntax (`*word`, `word*`, `*word*`); not directly linkable per the author (Discord link-posting restriction), find via search.
- Attached images (Discord CDN, not independently fetchable as text — all `.png` screenshots, kept as links only):
  - `Untitled5.png` (msg 1) — screenshot accompanying the intro/nax.moe artist-tag mention.
  - 4 screenshots on msg 4 (04:42 UTC) — the lorebook-off vs. lorebook-on comparison images referenced in §4 (generated character renders for each prompt).
  - 4 screenshots on msg 6 (07 Jan, "Piccies attached"), including one named `Danbooru20tag20test_...png` — illustrate the position/depth fix from §6 (lorebook entry settings + a resulting test generation).
- `https://tenor.com/view/the-more-you-learn-and-shit-the-more-you-know-learn-gif-12172546` — closing reaction GIF ("the more you know"), no informational content.
