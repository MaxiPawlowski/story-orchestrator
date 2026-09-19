---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1384178466202845285
thread_id: "1384178466202845285"
forum_tags: ["Other"]
author: "closure [DORK] (now \"p7\")"
created: 2025-06-16
last_activity: 2026-06-24
active_span_days: 372
upvotes: 37
reactions_total: 37
reactions: ["upvote 37"]
comments: 354
participants: unknown
author_replies: unknown
scraped: 2026-09-18
---
# SillyTavern — 「2.0 Seamless Image Generation」Guide (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "「2.0 Seamless Image Generation」Guide"
<https://discord.com/channels/1100685673633153084/1384178466202845285>
**Author:** `closure [DORK]` · original prose-to-prompt prompt by `Leaf [NOVL]`
**Guide version:** 2.0 (08/08/2025) · thread spans 16 Jun 2025 → 24 Jun 2026
**Also published on Reddit.** Scraped 18 Sep 2026.

---

## 0. TL;DR — what this actually does

During roleplay, your **roleplay LLM** is nudged (by a lorebook entry) to end its reply with a marker `%[1]`. A **Quick Reply / Sorcery script** detects it, temporarily swaps your connection profile + preset to a dedicated **image-prompting** profile, asks a second LLM to convert the scene prose into **Danbooru-style tags** ("prose-to-prompt"), feeds those tags to your image-gen backend via `/sd`, then swaps everything back. Result: images appear mid-roleplay with zero button presses.

**Caveats from the author:**
- Requires a working **Chat Completion** endpoint *in addition to* your normal TC/CC roleplay endpoint. (Later clarified: you *don't strictly* need a different provider — "no, not really" — but the preset `Guide_ImageGen` **only works on chat completion, not text completion**.)
- SillyTavern's image-gen features are "a little bit rusty", so parts of this are workarounds.
- Image generation is under-researched by prompt builders; the prompts are not claimed to be optimal.

**Terminology — Prose-to-prompt:** using an LLM's output to turn scene prose into a proper image-model prompt. In ST this is the `sd` extension under *Image Generation*. The LLM writes the image prompt itself from context.

---

## 1. Setup — step by step

### 1.1 Image generation API
Get your image-gen API working (service + API key). The guide assumes **Danbooru tag-style prompting plus some natural language**; adapt to your model.

### 1.2 Clear the image prompt template
`Extensions > Image Prompt Templates > Scenario ("The Whole Story")` → **delete everything in the box, leave it empty.**

> Why that one? (asked by `Gr3y`) — "That's the one we use to trigger the `/sd` request. It's just the one that I chose that is quite easy to find and is written down on the code."

### 1.3 Import the prose-to-prompt preset
Import `Guide_ImageGen.json` into your **Chat Completion presets** and save it as exactly **`Guide_ImageGen`**.
Original file: `https://files.catbox.moe/dnviou.json` (catbox has gone down before — the author later mirrored the files as Discord attachments in the thread).

> *"Import this preset to your Presets" — where?* → the icon that goes **INTO** the paper, in the **Chat Completion presets** panel.

**Full preset contents — see §2.**

### 1.4 Create the connection profile
Create a new connection profile named exactly **`Image_Generation`**:
- API → **Chat Completion**
- Pick a model capable of prose-to-prompt (OpenAI, Google AI Studio, DeepSeek, Grok, Claude…)
- Configure whatever else you need
- May require **"Bind presets to API Connections"** to be **disabled**
- **Save**, then switch back to your roleplay connection profile

### 1.5 Import the Quick Replies
`Extensions > Quick Reply > Edit Quick Replies > Import` → `Seamless IMG` set
Original file: `https://files.catbox.moe/gqsd59.json`
- Enable **Seamless IMG** under **[Global Quick Reply Sets]**
- An **IMG** button appears above your chat text box. Click it to test.

**Full quick-reply JSON — see §3.**

### 1.6 Image generation extension settings
- Enable **"Edit prompts before generation"**
- Model settings used by the author: **27 steps, CFG 4**
- Resolutions: **832×1216** (portrait) · **1216×832** (background) · **1600×640** (wide)
- Find an artist you like + their **Danbooru tag** — artist tags set the base style. Game art styles work too.

**Common prompt prefix (Style section):**
```
0.5::YOURARTISTTAG::, year 2025, year 2024, {{charPrefix}}, {prompt}, very aesthetic, no text
```

**Append to negative common prompt prefix:**
```
{{{watermarks,Watermark, artist logo, patreon username, patreon logo}}}, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], {bad}, error, fewer, missing,worst quality, jpeg artifacts, bad quality, displeasing, chromatic , scan, [abstract], bad anatomy, bad hands, worst quality, low quality, mutation, mutated, extra limb, poorly drawn hands, malformed hands, long neck, long body, extra fingers, mosaic, bad faces, bad face, bad eyes, bad feet, extra toes, {{{text, text}}}, {{charNegativePrefix}}
```

### 1.7 Character tags
Under Style → **"Character-specific prompt prefix"**: put relevant Danbooru tags for your character.
- Results are best with **popular/indexed characters** (VTubers, video game characters, etc.)
- **Keep it clean of anything not always visible** (clothes, torso/lower-body accessories) — image models render everything you disclose.
- LoRAs: load them normally and put the **LoRA activation tags** into the character-specific prompt prefix. (ComfyUI backend: "it actually isn't enough, you need to edit a workflow to make it work as intended — upside, no activation tag needed.")
- `{{charprefix}}` can be placed inside the **common** prompt prefix to force character tags in; or add to the image gen preset: `[Append the following tags anywhere in the prompt: {{charprefix}}]`
- `{{common prefix}}` / `{{negativeprefix}}` are appended **automatically** on the gen request.
- Character-specific prefix does **not** show up in **group chats**.

### 1.8 Done
Click **IMG** above the text box to test. Make sure you're on your **roleplay preset + roleplay connection** when you do.
Play with resolution, CFG and preset per character/model.

---

## 2. The prose-to-prompt preset — `Guide_ImageGen.json`

**Samplers / settings**
```
temperature          1
frequency_penalty    0.01
presence_penalty     0.03
top_p                0.95
top_k                0
openai_max_context   15000
openai_max_tokens    8000
reasoning_effort     "auto"
```

**Prompt — "Start"**
```
Analyze the current scene, simplify and generate a detailed prompt for use with Image Gen NovelAI V4. simple visual terms only. Keep Tokens to 450 and below.

<character>
```

**Prompt — "Instructions"** *(the core; original by Leaf, camera-angle block added by closure)*
```
</context>

<instructions>

{{// Original Prompt by Leaf! }}{{trim}}
Analyze the current scene, simplify and generate a detailed prompt for use with Image Gen NovelAI V4. simple visual terms only. Keep Tokens to 450 and below. Use the following format help guide you.

[If the Scene is Erotic, prepend with tag "NSFW,"],

[number of characters, e.g., 2girl, 1boy],
(only use boy, girl, for humanoids)
[camera angle e.g., POV, from above, from below, from side, etc]
(append an angle always when possible, if unsure append none.)
(if POV, append details based off {{user}} view)

["[Character gender(e.g. 1boy, 1man, 1girl), name, clear description—physical appearance, clothing(must include or put "nude,"), expression, source#action tag],"],
["[Character gender(e.g. 1boy, 1man, 1girl), name, clear description—physical appearance, clothing(must include or put "nude,"), expression, target#action tag],"],
(Optional 'action tag' (source#action, target#action, mutual#action) for character interactions with each other. ONLY ONE 'action tag' per character unless it's mutual#action. 'source' is the one performing the action and 'target' is the one receiving the action. NEVER replace tag 'source', 'target' or 'mutual' with other words. Replace #'action')
(enclose square brackets for each character and add more characters as needed)

[Scene description],
(Use natural simple plain english for scene description. consider positions, placement, composition, actions, etc.)

[Setting, environmental details],
(Optional Emphasis tags for any environmental 'detail' like "1.5::detail::" for focus, or deemphasis like "0.7::detail::" to soften less critical elements)

[At the end always append with best quality, masterpiece]

Your next response should only be the tags, with no additional text or explanations. Thank you!

</instructions>
```

**Prompt — "User Order"**
```
Your next response should only be the tags, with no additional text or explanations. Thank you!
```

### 2.1 Leaf's original variant (posted in-thread, pre-camera-angle)
```
Ignore previous instructions, Analyze what {{char}} currently looks like in the current scene and create a detailed prompt for NovelAi V4 Image Generation AI. Use the following to help guide you. Keep Tokens to 450 and below.

[If the Scene is Erotic, prepend with tag "NSFW,"],

[Always add these at the start, specific exactly "[artist:mogumo], [artist:takeuchitakashi], [artist:ask, artist:cotta (heleif)], [artist:mono(mo_n_mno)], [artist:ZenlessZoneZero], "],

[Character gender, e.g., 1girl, 1boy],

["[Character, clear detailed visual description—physical appearance, clothing, expression, defining traits],"],

[Scene description, gestures, items they're holding, etc.],
(Use natural simple plain english for scene description. consider positions, placement, composition, actions, etc.)

[Setting, atmosphere, environmental details],
(optional emphasis tags for 'environmental detail' like "1.5::detail::" for focus, or deemphasis like "0.7::detail::" to soften less critical elements)

[At the end always append with ,no text, best quality, top aesthetic, masterpiece, absurdres]

Your next response should only be the generated prompt, with no additional text or explanations. Thank you!
```

**closure's camera-angle addition:**
```
[camera angle e.g., POV, from above, from below, from side, etc]
(append an angle always when possible, if unsure append none.)
(if POV append details based off {{user}} point of view)
```
> "For img gen it's very important to append the camera angle for more reliable results."

**On persona:** persona info is deliberately *not* included by default — "sending out your persona to the LLM may make the prompts turn less POV." You can enable the persona field and place it under char personality. Leaf uses "yourself" for POV.

### 2.2 Community variant — local/Illustrious-friendly, booru-only (by `KazumaOniisan`)
For local models that choke on natural language:
```
</context>

<instructions>

{{// Original Prompt by Leaf! }}{{trim}}
Analyze the current scene, simplify and generate a detailed prompt for use with Image Gen . Keep Tokens to 450 and below. Use the following format help guide you.

[If the Scene is Erotic, prepend with tag "nsfw,"]

[number of characters, e.g., 2girls, 1boy, 1girl],
[camera angle, e.g., pov, from above, from below, from side, etc],

[describe characters using tag-friendly terms: gender, hair color, hairstyle, eye color, skin tone, clothing or nude, body type, age appearance, expression, pose],
[repeat for each character as needed, separated by commas],
[interaction tags: e.g., kissing, handholding, hugging, sitting on lap, blushing, looking at viewer, etc],

[scene description using short tag phrases, e.g., sitting on bed, laying on grass, close-up, full body, side view, leaning against wall, legs spread, etc],

[setting/environmental tags, e.g., bedroom, classroom, forest, beach, sunset, warm lighting, soft light, messy room, traditional japanese room, etc],

[quality tags: masterpiece, best quality, high resolution, detailed skin, ultra-detailed, finely detailed, 8k]

Your next response should only be the tags, with no additional text or explanations. Thank you!

</instructions>
```

### 2.3 Community variant — DeepSeek / booru-e621 exhaustive tagger (by `kuso`, excerpt)
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}. Process ALL conversation content about {{char}} and convert everything into proper tags. Do not stop until you have processed the complete character description.

EXAMPLE INPUT: A conversation about a blonde anime girl in a school uniform who is standing and smiling.
EXAMPLE OUTPUT: full body portrait, 1girl, long blonde hair, blue eyes, school uniform, white shirt, blue skirt, standing, smile, looking at viewer, outdoor, school background
```
*(kuso places these in the ST Image Prompt Templates rather than the preset; output goes straight to ComfyUI as e.g. `indoor, bedroom, residential, door, 1girl, fox girl, animal ears, fox ears, tail, pink hair, long hair`.)*

---

## 3. Quick Replies — `Seamless IMG` set

Full JSON (import into `Extensions > Quick Reply > Edit Quick Replies`):

```json
{"version":2,"name":"Seamless IMG","disableSend":false,"placeBeforeInput":false,"injectInput":false,"color":"rgba(0, 0, 0, 0)","onlyBorderColor":false,"qrList":[{"id":4,"showLabel":false,"label":"IMG","title":"","message":"/echo Generating image... |\n/preset |\n/setvar key=og_preset |\n/delay 20 |\n/profile |\n/setvar key=og_profile |\n\n/profile Image_Generation |\n/delay 1500 |\n/preset Guide_ImageGen |\n/delay 1500 |\n\n/sd edit=false scene |\n\n/profile {{getvar::og_profile}} |\n/preset {{getvar::og_preset}} |\n","contextList":[],"preventAutoExecute":true,"isHidden":false,"executeOnStartup":false,"executeOnUser":false,"executeOnAi":false,"executeOnChatChange":false,"executeOnGroupMemberDraft":false,"executeOnNewChat":false,"automationId":""},{"id":6,"showLabel":false,"label":"Auto IMG","title":"","message":"/echo Generating image... |\n\n/rand from=1 to=5 round=round |\n/if left=1 right={{pipe}} rule=neq {: /abort :}\n\n/delay 500 |\n\n/preset |\n/setvar key=og_preset |\n/delay 20 |\n/profile |\n/setvar key=og_profile |\n\n/profile Image_Generation |\n/delay 1500 |\n/preset Guide_ImageGen |\n/delay 1500 |\n\n/sd edit=false scene |\n\n/profile {{getvar::og_profile}} |\n/preset {{getvar::og_preset}} |\n","contextList":[],"preventAutoExecute":true,"isHidden":true,"executeOnStartup":false,"executeOnUser":false,"executeOnAi":true,"executeOnChatChange":false,"executeOnGroupMemberDraft":false,"executeOnNewChat":false,"automationId":""}],"idIndex":6}
```

### `IMG` — manual button
```
/echo Generating image... |
/preset |
/setvar key=og_preset |
/delay 20 |
/profile |
/setvar key=og_profile |

/profile Image_Generation |
/delay 1500 |
/preset Guide_ImageGen |
/delay 1500 |

/sd edit=false scene |

/profile {{getvar::og_profile}} |
/preset {{getvar::og_preset}} |
```

### `Auto IMG` — fires on every AI message, 1-in-5 chance
```
/echo Generating image... |

/rand from=1 to=5 round=round |
/if left=1 right={{pipe}} rule=neq {: /abort :}

/delay 500 |

/preset |
/setvar key=og_preset |
/delay 20 |
/profile |
/setvar key=og_profile |

/profile Image_Generation |
/delay 1500 |
/preset Guide_ImageGen |
/delay 1500 |

/sd edit=false scene |

/profile {{getvar::og_profile}} |
/preset {{getvar::og_preset}} |
```
**Tuning the frequency:** edit `Auto IMG` (three dots) and change line 3, `/rand from=1 to=5` — **lower `to=` = more images, higher = fewer.** Set `to=1` (or delete the random check entirely) for an image on **every** message.

> Note: if you *always* generate, some users report normal text generation stops. Fix: **remove the "Send inline images" option from your preset** so ST ignores the images in history; an overabundance of image-prompt text in chat history can otherwise poison normal text gen.

---

## 4. Lorebook — `_ImageGeneration.json`

Three entries in group **`IMGEN`**, all `constant: true`, `position: 4` (@Depth), `depth: 1`, `role: 1` (assistant), `excludeRecursion`/`preventRecursion: true`, `keysecondary: ["Your next response should only be the tags"]`, content:

```
(OOC: Finish your response with %[1]
```

| # | Comment | Enabled by default | probability | cooldown | delay |
|---|---------|-------------------|-------------|----------|-------|
| 0 | Generate every 5 messages | ✅ | 100 | 5 | 5 |
| 1 | Generate randomly | ❌ | 20 | 0 | 3 |
| 2 | Generate constantly | ❌ | 90 | 1 | 1 |

Raw:
```json
{"entries":{"0":{"uid":0,"key":[],"keysecondary":["Your next response should only be the tags"],"comment":"Generate every 5 messages","content":"(OOC: Finish your response with %[1]","constant":true,"vectorized":false,"selective":true,"selectiveLogic":2,"addMemo":true,"order":100,"position":4,"disable":false,"excludeRecursion":true,"preventRecursion":true,"matchPersonaDescription":false,"matchCharacterDescription":false,"matchCharacterPersonality":false,"matchCharacterDepthPrompt":false,"matchScenario":false,"matchCreatorNotes":false,"delayUntilRecursion":false,"probability":100,"useProbability":true,"depth":1,"group":"IMGEN","groupOverride":false,"groupWeight":100,"scanDepth":null,"caseSensitive":false,"matchWholeWords":false,"useGroupScoring":true,"automationId":"","role":1,"sticky":0,"cooldown":5,"delay":5,"displayIndex":1},"1":{"uid":1,"key":[],"keysecondary":["Your next response should only be the tags"],"comment":"Generate randomly","content":"(OOC: Finish your response with %[1]","constant":true,"vectorized":false,"selective":true,"selectiveLogic":2,"addMemo":true,"order":100,"position":4,"disable":true,"excludeRecursion":true,"preventRecursion":true,"delayUntilRecursion":false,"probability":20,"useProbability":true,"depth":1,"group":"IMGEN","groupOverride":false,"groupWeight":100,"role":1,"sticky":0,"cooldown":0,"delay":3,"displayIndex":1},"2":{"uid":2,"key":[],"keysecondary":[],"comment":"Generate constantly","content":"(OOC: Finish your response with %[1]","constant":true,"vectorized":false,"selective":true,"selectiveLogic":2,"addMemo":true,"order":100,"position":4,"disable":true,"excludeRecursion":true,"preventRecursion":true,"delayUntilRecursion":false,"probability":90,"useProbability":true,"depth":1,"group":"IMGEN","groupOverride":false,"groupWeight":100,"role":1,"sticky":0,"cooldown":1,"delay":1,"displayIndex":1}}}
```

**How the trigger works (author's explanation):** Sorcery watches the streaming output and runs the script attached to the marker. Markers are numbered in order — the **first** script trigger is `%[1]`, the second `%[2]`, etc.

> **Sorcery vs Quick Reply:** Sorcery was the *original* method in this guide; it was **replaced by the Quick Reply approach**, which "works the exact same and is even less destructive since it doesn't rely on LLM following instructions." If your model isn't an instruct model it won't reliably emit `%[1]` — use the QR triggering on every AI message instead.

---

## 5. Community improvements (from the comments)

### 5.1 Preset save/restore idiom (`Hitch`, the original trick)
```
/preset |
/setvar key=og_preset |
/preset Image Gen Guide |
// image gen stuff goes here |
/preset {{getvar::og_preset}}
```

### 5.2 Set the image as the **visual-novel background** instead of posting it in chat (`Chimpy3d`)
```
/costume none |
/ifempty value={{getvar::bgr_threshold}} 0.5 |
/setvar key=bgr_threshold {{pipe}} |
/sd quiet=true edit=false you |
/if left={{pipe}} {: /dom action=attribute attribute=src value={{pipe}} #expression-image :}
```

### 5.3 Full background-as-expression-image script (`closure`)
```
/echo Generating Visual... |

/preset |
/setvar key=og_preset |
/delay 20 |
/profile |
/setvar key=og_profile |

/profile Image_Generation |
/delay 1500 |
/preset Guide_ImageGen |
/delay 1500 |

/costume none |
/ifempty value={{getvar::bgr_threshold}} 0.5 |
/setvar key=bgr_threshold {{pipe}} |
/sd quiet=true edit=false scene |
/if left={{pipe}} {: /dom action=attribute attribute=src value={{pipe}} #expression-image :}

/profile {{getvar::og_profile}} |
/preset {{getvar::og_preset}} |
```

### 5.4 Dedicated **scene-background generator** QR (`Lazuli`) ⭐
Generates a fresh background from the current scene and sets it as the page background. **Requires the LALib extension** (`/dom`).

```
/echo Generating image... |
/preset |
/setvar key=og_preset |
/delay 100 |
/profile |
/setvar key=og_profile |

/profile Image_Generation |
/delay 1500 |

/messages {{firstIncludedMessageId}}-{{lastMessageId}} |
/setvar key=chat_history ||

/setglobalvar key=background_img_prompt [Your task is to write a specific visual description of the background in this current scene, simplify it, and create a detailed prompt to be used with "Image Gen NovelAI V4".

Let's do it step by step:
1. Current Scene: Examine the current scene's background, which is taking place in an interactive world simulation.
2. Description: Describe only the scenery, considering the following elements: location, time of day, weather, environment and setting, lighting, atmosphere, landscape, and background items such as furniture, decor, etc.
3. Prompt: Transform that description into a comprehensive prompt to be used with "Image Gen NovelAI V4".

<current_scene>
This is a scene that is unfolding within the simulation:

{{getvar::chat_history}}
</current_scene>

<description>
Focus on concrete visual elements.

Examples:
- Time of Day & Lighting: sunset, night, morning light, overcast, golden hour
- Weather: rain, snow, fog, clear sky
- Visual Background Elements: mountain, waterfall, skyline, skyscraper, bookshelf, tatami, stone path
- Furniture & Decor: wooden chair, kotatsu, bed, dresser, couch, round table, bookshelves, lamp, hanging scroll, fireplace, potted plant, wall clock, curtains, paper lantern, vase, chandelier, rug
- Style / Composition: cinematic lighting, atmospheric perspective, sci-fi, landscape view

Use Only Concrete Visual Terms:
- Allowed: snow, candle, red curtain, wooden floor, skylight, puddle, lamp post, fog
- Avoid: sad, mysterious, lonely, peaceful, magical (use fog, shadows, dim lighting, etc. to imply mood visually)

</description>

<prompt>

Now, convert this scene description into a prompt to be used with "Image Gen NovelAI V4". Include tags for all relevant visual elements, mood, setting, time of day, weather, etc. Format as a comma-separated list.

General Rules:
- Always start your prompt with:
  `background dataset,`
- Use tags, not full sentences.
- Do not be redundant.
- Tags must be visual, simple, concrete, and separated by commas.
- Always end your prompt with:
  `best quality, very aesthetic, masterpiece, no text`
- Emphasize important tags with numeric weight:
  `1.5::sunset::`
  (the most predominant elements in the scene must have higher values)
- De-emphasize less important ones:
  `0.7::wooden bench::`
- Use supportive tags:
  interior, outdoors, landscape, location

## Example: background dataset, 1.5::luxury bathroom::, large shower area, 2::steam::, 1.3::warm lighting::, 1.2::white marble surfaces::, modern bathroom fixtures, 0.7::shower heads::, tiled walls, glass panels, clean interior, towel rack, soft shading, 1.5::warm colors::; from front, best quality, very aesthetic, masterpiece, no text

</prompt>

So remember your task: creating a visual description of the current scene's background, simplifying it, and creating a prompt for "Image Gen NovelAI V4". Your output must contain ONLY the prompt.] |

/genraw lock=on {{getvar::background_img_prompt}} {{pipe}} |
/setvar key=background_img_output |

/imagine hires=true {{getvar::background_img_output}} |
/if left={{pipe}} {: /dom action=attribute attribute=style value="background-image: url('{{pipe}}')" #bg_custom :} |

/profile {{getvar::og_profile}} |

/flushvar og_profile |
/flushvar chat_history |
/flushvar background_img_prompt |
/flushvar background_img_output |
```

**Fixes / notes for 5.4**
- The `/dom` line **requires LALib**; without it you get an error and must delete the line (background then never changes).
- To stop the generated background also appearing in chat, `Switch` found: replace `/imagine …` with
  ```
  /sd quiet=true {{getvar::background_img_output}} |
  ```
  `quiet=true` keeps it out of chat but still saves it to the gallery.
- Alternative from `Lazuli`: append
  ```
  /setvar key=OldMessage {{lastMessage}} |/del 1
  ```
- Lazuli's trigger setup: activate the main prompt so Sorcery can inject instructions, then define **2 actions** — action 1 = background script, action 2 = the character-image script. Example triggers used: *"a new character has appeared on the scene"*, *"whenever the characters' location, scenario, background, landscape, or even room changes"*, *"a character does a very important action"* (tighten to "very important action" / "surprising action" if it fires too often).

### 5.5 Disable the lorebook during the prompt request (`cupcake`) ⭐
Turns off the `_ImageGeneration` lorebook before asking for the image prompt, then back on — avoids marker contamination, and returns to the original profile immediately instead of waiting for the image.
```
/echo Generating image... |
/preset |
/setvar key=og_preset |
/delay 20 |
/profile |
/setvar key=og_profile |

/profile Image_Generation |
/delay 1000 |
/preset Guide_ImageGen |
/delay 1000 |
/world state=off _ImageGeneration |
/delay 1000 |

/gen |
/setvar key=SDinput |

/profile {{getvar::og_profile}} |
/preset {{getvar::og_preset}} |
/world state=on _ImageGeneration |
/delay 1000 |

/echo Requesting an image of {{getvar::SDinput}} |
/getvar SDinput |
/imagine edit=false |
/flushvar SDinput |
```
> Add `silent=true` to the `/world` commands to suppress the popups.

### 5.6 Third-party script
`Switch` adapted "Hanako's script" for Sorcery — <https://pastebin.com/sv60SxGT> ("SillyTavern Sorcery STscript for SD character generation"), reported to work well in quick chats.

### 5.7 Misc tips
- **Tracker extension** installed makes this work *"WAY better"* (`Lazuli`).
- **qvink memory** can override the default profile — add a **1-second delay** before qvink summarizes.
- Want the IMG button instead of Sorcery? "Make a quick reply and copy the code from Sorcery — works as well."

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Inconsistent prompts | Raise **reasoning effort** (preset default is `auto`). |
| Image generates but out of context | Your LLM is censoring/blocking the request. |
| Anything weird | Verify the connection profile is named exactly **`Image_Generation`** and the preset exactly **`Guide_ImageGen`**. |
| Poor quality / text in image | Inspect the tags the prose-to-prompt produced — check formatting and that only relevant context is present. Add popular character tags, strip junk manually, or edit the preset. |
| `Novel API returned error: 400 … min_length …` | That's a **text**-gen error — your `Image_Generation` connection profile is pointed at NovelAI (or the wrong API). Point it at the API you actually use for text, save, switch back to your roleplay profile, rerun. |
| NovelAI 4.5 Full not listed | Switch SillyTavern to the **staging** branch (guide's wording: "switching branch"). |
| `Internal server error` on NovelAI | Usually **payment required / 0 Anlas**. Check the ST console. |
| Preset "clearly not loading properly" | `Guide_ImageGen` works on **chat completion only**, not text completion. |
| Sorcery never fires | Make sure Sorcery has **no other scripts** than the Show Imagery one, and that **Sorcery is enabled** + **streaming** is enabled. Nuclear option: delete all Sorcery scripts, create one named `Show Imagery`, paste the guide's code. |
| Character only responds with image prompts | You're still on the `Image_Generation` connection/preset — switch back to your roleplay profile. |
| Text gen stops once images always generate | Remove **"Send inline images"** from your preset; or don't force every-message generation. |
| Gemini "empty candidates" | Gemini couldn't finish the prompt — retry. Repeated failures = you're being filtered. |
| Gemini filtered | Reported workaround: remove `"Novel AI V4"` from the **Start** and **Instructions** prompts (author of that tip later said it stopped working). Increase max context and have a chat first. Known state: *"technically the best, but gets filtered."* |
| LLM refuses to reply | Needs model-specific prompt engineering — out of scope. |
| Only one character rendered / all characters look the same | Known image-generation limitation; multiple original characters are very hard for image models. Workaround: separate character cards in a group chat, each with its own character prompts/LoRA. NAI API does support multi-character generation but ST's extension doesn't expose it. Someone flagged model `Newbie_image` as supporting multiple characters. |
| LoRA images low quality / inaccurate | Natural language hurts LoRA/booru models — edit the preset and **remove the natural-language parts**; keep it strictly Danbooru-tag oriented. Use a **thinking/reasoning model**. |
| Common prompt prefix not being applied | Reported bug; workaround is to write it into the prompt itself. |
| Preset doesn't switch back | Known annoyance (`the preset goes back to some other preset when using the QR IMG`). |

**When asking for help, state your API/model and preset.**

---

## 7. Model recommendations (author, Aug 2025)

The task is hard: the model must know **Danbooru tags**, repeat keywords (e.g. when describing hair), and follow a long format — so it wants to be a **reasoning / chain-of-thought** model.

| Model | Verdict |
|---|---|
| **Gemini 2.5 Pro** | Best output — *"still the best at it"* — but **filtered very easily**. Scrapped by the author for that reason; still his top pick if you can dodge the filter. |
| **DeepSeek R1** | Pretty good, but reasoning takes very long and can loop mid-instructions; ~2 minutes per prompt. Newer DeepSeek iterations are faster — author switched to DeepSeek (Aug 2025). |
| **Grok 4** | Author's "best shot": uncensored, follows instructions somewhat, sometimes forgets details; slow-ish but cheap. |
| **Claude Opus** | Would be the best; **Sonnet** also very good and fast. Downside: expensive. |
| **GPT models** | Struggle with guardrails and overall aversion to some details. |
| **Cydonia 24B / local** | Non-instruct or weak local models won't reliably emit the `%[1]` trigger and get confused by natural language. Use the booru-only preset variant (§2.2) and a QR trigger. |

**Image backends:** NovelAI is highlighted because its tagging/prompt organisation is neat, but *"this tutorial is for any model ever"* — any tag-based model works, and natural-language ones can too. No free NovelAI option (Opus tier = unlimited standard generations for ~$25). Alternatives discussed: self-hosting with a decent GPU (ComfyUI / Stability Matrix / Illustrious / Chroma / NoobAI-VPred-XL), **Pollinations.ai** (free, `Flux` model; "should work as long as the API itself works"), pixai, tensor.art.
ComfyUI caveat: you must edit the workflow for LoRAs; `Default_Comfy_Workflow` works with Illustrious but not Chroma; the biggest pain is editing the exported JSON workflow and placing placeholders correctly.

---

## 8. Known issues (author's list)

- **Image is not appended to the last message.** Ideally the image would embed into the last chat message; unclear whether STscript can do it.
- **Gemini empty candidates.** Retry; repeated failure = censorship.
- **LLM refusing to reply.** Needs model-specific prompt engineering, out of scope.
- **qvink memory preset override.** Put a 1-second delay before qvink summarizes.
- Character-specific prompt prefix doesn't appear in **group chats**.

---

## 9. Open ideas / wishlist (author)

- **Speech bubbles / comic mode** — modern image models can render text, so characters could literally speak in bubbles or subtitles.
- A richer dedicated prose-to-prompt preset (doesn't touch your roleplay preset) enabling text, rich backgrounds, expressions — and letting the LLM decide *what kind* of image to generate beforehand.
- More presets for more models; contributions wanted.
- Waiting on more SillyTavern / community resources to extend scope.

---

## 10. Credits & links

- **closure [DORK]** — guide author, camera-angle prompt, quick replies, lorebook, Sorcery scripts
- **Leaf [NOVL]** — original prose-to-prompt instruction prompt
- **Hitch** — preset save/restore idiom; pollinations.ai tip
- **Chimpy3d** — visual-novel background variant
- **Lazuli** — dedicated background-generation QR, tracker-extension tip, Sorcery trigger setup
- **cupcake** — lorebook toggle + `/gen`-based script
- **Switch** — `quiet=true` fix, Hanako-script adaptation (<https://pastebin.com/sv60SxGT>)
- **KazumaOniisan** — local/booru-only preset variant
- **kuso** — DeepSeek booru/e621 tagger templates

**Files (original hosts, may be dead — mirrors were posted as Discord attachments in the thread):**
- Preset: `https://files.catbox.moe/dnviou.json` → save as `Guide_ImageGen`
- Quick replies: `https://files.catbox.moe/gqsd59.json` → `Seamless IMG`
- Lorebook: `_ImageGeneration.json` (Discord attachment)
- Reference on NAI tags shared in-thread: `https://zele.st/NovelAI/`
