---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1406653968477851760
thread_id: "1406653968477851760"
forum_tags: ["WorldInfo/Lorebooks", "Character Management", "Character Creation", "Group Chats", "API"]
author: "Leinstay"
created: 2025-08-17
last_activity: 2026-06-19
active_span_days: 305
upvotes: 53
reactions_total: 57
reactions: ["upvote 53", "AniBongoPuss 4"]
comments: 68
participants: 10
author_replies: 49
scraped: 2026-09-18
---
# SillyTavern — Lein's Beginner's Guide: Introduction to ST (extensions, memory, image/video generation) (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Lein's Beginner's Guide: Introduction to ST (extensions, memory, image/video generation)"
<https://discord.com/channels/1100685673633153084/1406653968477851760>
**Author:** `Leinstay` · comments by `Frogster`, `weather`, `Stylendr`, `Ash`, `Geh` and others
**Thread spans:** 17 Aug 2025 → 19 Jun 2026 (69 messages; the guide itself was posted 17 Aug 2025, last substantive reply 7 Oct 2025)
**Also published on Reddit:** <https://www.reddit.com/r/SillyTavernAI/comments/1msah5u/i_finished_my_stbased_endless_vn_project_huge/> (with extra info in its comments). Scraped 18 Sep 2026.

---

## 0. TL;DR — what this guide is

A day-one orientation for someone building an "endless visual novel" in SillyTavern with no prior LLM knowledge. It covers: terminology, which extensions the author considers must-have, how he handled long-term **memory** (Summarize-generated "chronicles" → Data Bank + Vector Storage, plus lorebooks), preset/main-prompt strategy, character and world writing (**PLists + Ali:Chat**), the three core **group-chat** problems and their macro/extension fixes, LLM-based **translation** (Magic Translation), and producing visuals — backgrounds and characters with **ComfyUI / IP-Adapter / ControlNet**, and ~28 expression sprites via **WAN** image-to-video frame extraction.

It is an experience report, not a step-by-step recipe; most depth is delegated to linked guides. The author (a web developer, ~2 weeks into ST at writing time) invites corrections.

**Author's own later update (4 Oct 2025) — partly supersedes the guide:**
- He **dropped group chats**: "it is a hassle to chat with." He now merges cards into one multi-character card fed to a narrator ("card merging"), with a different card structure and presets.
- For memory, on a ~3k-message chat he got the best results, with easier maintenance, from **ST Memory Books (STMB)** — <https://github.com/aikohanasaki/SillyTavern-MemoryBooks> — "You basically mark scenes using two buttons and summarize them into vectorized lorebooks." This replaces the manual chronicle workflow in §5 as his recommendation.
- The original filebin "full pack" link expired; an updated files link was put in the first message (see §12). He noted even the Reddit update is "already outdated".

---

## 1. Terminology (author's glossary)

- **LLM (Large Language Model):** the text brain that writes prose and plays characters (Claude, DeepSeek, Gemini…). Runs **locally** (koboldcpp / llama.cpp style) or **via API** (OpenRouter or vendor APIs). SillyTavern is only the frontend; you bring the backend. New users: <https://docs.sillytavern.app/>.
- **B (in model names):** billions of parameters. "7B" ≈ 7 billion; more B usually = smarter/more fluent, but more VRAM / cost.
- **Token:** a chunk of text (≈ word pieces).
- **Context window:** how many tokens the model considers at once. Overflow → older parts drop out or get summarized (details vanish). Advertised limits overstate usable quality — e.g. quality degrades around **20k for DeepSeek V3** even when larger windows are advertised (e.g. 65k).
- **Prompt / Context Template:** the structured text ST sends to the LLM (system / user / history / world notes…).
- **RAG (Retrieval-Augmented Generation):** in ST = **Data Bank** (usually a text file you maintain by hand) + **Vector Storage** (built-in extension; set it up and occasionally run **Vectorize All**). It embeds documents as vectors and injects only the most relevant chunks into the current prompt.
- **Lorebook / World Info (WI):** same idea, human-readable key → fact form. A fact has trigger keys; when a key appears in chat, the fact is pulled in. "A canon facts cache with triggers."
- **PList (Property List):** compact key-value bullet list for a character/world. Example:

  ```
  [Manami: extroverted, tomboy, athletic, intelligent, caring, kind, sweet, honest, happy, sensitive, selfless, enthusiastic, silly, curious, dreamer, inferiority complex, doubts her intelligence, makes shallow friendships, respects few friends, loves chatting, likes anime and manga, likes video games, likes swimming, likes the beach, close friends with {{user}}, classmates with {{user}}; Manami's clothes: blouse(mint-green)/shorts(denim)/flats; Manami's body: young woman/fair-skinned/hair(light blue, short, messy)/eyes(blue)/nail polish(magenta); Genre: slice of life; Tags: city, park, quantum physics, exam, university; Scenario: {{char}} wants {{user}}'s help with studying for their next quantum physics exam. Eventually they finish studying and hang out together.]
  ```

- **Ali:Chat:** a mini dialogue scene that *demonstrates* how the character talks/acts, anchoring the PList traits. Example:

  ```
  <START> {{user}}: Brief life story? {{char}}: I... don't really have much to say. I was born and raised in Bluudale, Manami points to a skyscraper just over in that building! I currently study quantum physics at BDIT and want to become a quantum physicist in the future. Why? I find the study of the unknown interesting thinks and quantum physics is basically the unknown? beaming I also volunteer for the city to give back to the community I grew up in. Why do I frequent this park? she laughs then grins You should know that silly! I usually come here to relax, study, jog, and play sports. But, what I enjoy the most is hanging out with close friends... like you!
  ```
  (Both examples come from Kingbri's guide; the Discord paste lost the `*action*` asterisks.)

- **Checkpoint (image model):** the main diffusion model (SDXL, SD1.5, FLUX). Sets base style/quality.
- **Finetune:** a checkpoint trained further on a niche style (e.g. Juggernaut XL).
- **LoRA:** small add-on injecting a style or character without a new 7–10 GB checkpoint.
- **ComfyUI:** node-based UI for image/video workflows.
- **WAN:** text-to-video / image-to-video model family — animate a still portrait, export frames as expression sprites.

---

## 2. Core — models

- Local **7B–13B** models tried on a laptop RTX 4090 (mobile) — conclusion: "the corporations have already won." API models (**DeepSeek 3, R1, Gemini 2.5 Pro, Claude series**) are on another level for prose.
- ChatGPT: great for technical work, "a complete disaster" for roleplay (old and new).
- Author's subjective ranking (all tested directly in **Chat Completion** mode, not through OpenRouter):
  **Claude Sonnet 3.7 > Claude Sonnet 4.1 > Gemini 2.5 Pro > DeepSeek 3** — prices per 1M tokens roughly in the same order ("for Claude you will need a loan").
- He chose **DeepSeek 3** for cost (~$0.10 per 1M tokens as he quotes it) and its "originality". No objective ranking claimed — test yourself.

---

## 3. Extensions

### 3.1 Built-in
| Extension | What it does (author's notes) |
|---|---|
| **Character Expressions** | Swaps character sprites by emotion/state, VN-style. Needs 1–28 emotion images (png/gif/webp) per character. |
| **Quick Reply** | One-click buttons with predefined messages/actions. |
| **Chat Translation** (official) | Automatic translation via external services (Google Translate, DeepL). DeepL "okay-ish" for chat, not free. |
| **Image Generation** | Generates persona, character, background, last message, etc. via your image model. Works best for **backgrounds**. |
| **Image Prompt Templates** | Prompts sent to the LLM, which returns an image prompt that goes to image generation. |
| **Image Captioning** | Most LLMs won't recognize inline images; captioning converts them to text descriptions fed into context. |
| **Summarize** | Auto/manual chat summaries injected into specific places of the main prompt. |
| **Regex** | Automatic search/replace with your rules. Ask any LLM to write the regex (e.g. change all em-dashes to commas). |
| **Vector Storage** | Stores/retrieves relevant text chunks for long-term memory (see §5). |

(A screenshot of the extensions panel accompanied this list.)

### 3.2 Installable (author's must-haves)
- **Group Expressions** — shows multiple characters' sprites at once in VN and Standard modes (default Character Expressions shows only the active one). Part of Lenny Suite: <https://github.com/underscorex86/SillyTavern-LennySuite>
- **Presence** — auto/manual mute/hide characters from seeing certain messages: <https://github.com/lackyas/SillyTavern-Presence>
- **Magic Translation** — real-time LLM translation with model choice: <https://github.com/bmen25124/SillyTavern-Magic-Translation>
- **Guided Generations** — force another character to say what you want, or compose your response better than the stock impersonator: <https://github.com/Samueras/Guided-Generations>
- **Dialogue Colorizer** — auto-colors quoted dialogue per character/persona: <https://github.com/XanadusWorks/SillyTavern-Dialogue-Colorizer>
- **Stepped Thinking** — calls the LLM again (one or more times) before the response to think, re-think, plan, then speak: <https://github.com/cierru/st-stepped-thinking>
- **Moonlit Echoes Theme** — UI skin, helpful author: <https://github.com/RivelleDays/SillyTavern-MoonlitEchoesTheme>
- **Top Bar** — top bar with shortcuts to quick actions: <https://github.com/SillyTavern/Extension-TopInfoBar>

### 3.3 Worth mentioning, with caveats
- **StatSuite** — persistent state tracking: <https://github.com/leDissolution/StatSuite>. Bugs seen: loses track of persona, merges locations ("suddenly you're in two cities at once"), weird custom entries — mostly blamed on the default model it ships with. Mainly useful for short-term state (current outfit), which newer models handle anyway. Recommended only in **manual mode** for now.
- **Prome-VN-Extension** — VN-mode features: <https://github.com/Bronya-Rand/Prome-VN-Extension>. Author doesn't use it: works only in VN mode, and the VN text box is too small for his writing.
- **Your own extension** — extensions are just JavaScript + CSS. He fed the ST extension template to ChatGPT and got a custom extension that replaced the default **Impersonate** button with Guided Impersonate and hid the rest of the Guided panel.
  - Template: <https://github.com/city-unit/st-extension-example>
  - Docs: <https://docs.sillytavern.app/for-contributors/writing-extensions/>

---

## 4. Model settings (presets and main prompt)

- The most important step is **AI Response Configuration**: where you make the model act as an RP narrator and set the order in which character cards, lorebooks, chat history etc. are fed in.
- **Marinara preset** (<https://rentry.org/marinara-spaghetti>) — popular plug-and-play starting point and a beginner's guide to ST; barebones by design. Fine if you roleplay with many cards from many sources / don't know your model yet.
- Author instead took **eteitaxiv's ChatStream v2 per-model presets** (<https://www.reddit.com/r/SillyTavernAI/comments/1maiava/chatstream_v2_per_model_presets_kimi_deepseek/>) as a base and almost fully rewrote it:
  - **Stepped Thinking extension** worked much better than asking the model to "describe thoughts in `<think>` tags".
  - Tuned amount of text and dialogue.
  - Explained the desired **arc structure**: adventure → downtime for conversations → adventure again. Without it, DeepSeek "grabs you by the throat" and never lets characters sit and chat.
- Conclusion: beyond generic use, you'll need a **custom preset** tailored to your model and goals.
- Samplers — trial and error, google per model:
  - **Temperature** — randomness/creativity (higher = more variety, lower = more consistent).
  - **Top P** — how wide the model samples next tokens (higher = more diverse/riskier, lower = safer/duller).

(Screenshot of his preset / prompt manager accompanied this section.)

---

## 5. Memory

Why it's hard: LLMs don't remember. Every request is one fresh prompt stitched from character card + main prompt + context — inspect it via **Magic Wand → Inspect Prompts**. Messages beyond the context window aren't sent; long contexts lose detail. The only fixes: a vastly larger context, or **ruthlessly controlling what gets injected**.

### 5.1 Chronicles → Data Bank → Vector Storage (original workflow)
1. Use the **Summarize** extension to generate "chronicles" in diary format — important events, dates, times, places. Its output is **not** injected into the prompt directly.
2. Review/rewrite them by hand, save into a text document.
3. Upload the document: **Magic Wand → Data Bank → Chat Files**.
4. In the Vector Storage extension click **Vectorize All** (with the settings from his guide screenshot — the numeric settings were only shown as an image). Relevant entries then get injected when relevant, quality depending on the chronicle.

Example chronicle entry:
```
[Day 1, Morning, Wilderness Camp]

The discussion centered on the anomalous artifact. Moon revealed it's runes were not standard Old Empire tech and that it's presence caused a reality "skip". Sun showed concern over the tension, while Moon reacted to Wolf's teasing compliment with brief, hidden fluster. Wolf confirmed the plan to go to the city first and devise a cover story for the artifact, reassuring Moon that he would be more vigilant for similar anomalies in the future. Moon accepted the plan but gave a final warning that something unseen seemed to be "listening".
```

### 5.2 Lorebooks for facts
Only important facts, terms and memory fragments, key → event. PLists/Ali:Chat format is better, but he admits using a looser format (screenshot of a lorebook entry shown).

### 5.3 The "romantic" in-fiction workaround
Explain memory and context to the characters as part of the world. Sometimes characters notice they may forget something and ask you to write it into the lorebook/chronicle; sometimes it derails (his test run became an *I, Robot*-style simulation bug hunt). Example lorebook entry:
```
Keys: memory, forget, fade, forgotten, remember
Memory: The Simulation Core's finite context creates the risk of memory degradation. When the context limit is reached or stressed by too many new events, Companions may experience memory lapses, forgetting details, conversations, or even entire events that were not anchored in the Lorebook. In extreme cases, non-essential places or objects can "de-render" from the world, fading from existence until recalled. This makes the Lorebook the only guaranteed form of preservation.
```
His "Meta Framework" lorebook (in the files pack, attached as a character auxiliary lorebook) explains to characters they're inside an LLM.

### 5.4 Superseded (Oct 2025)
Author now recommends **ST Memory Books** (<https://github.com/aikohanasaki/SillyTavern-MemoryBooks>): mark scene start/end with two buttons, summarize into **vectorized lorebooks**. Best results + easiest maintenance on a 3k-message chat.

Further reading: <https://www.reddit.com/r/SillyTavernAI/comments/18agtc9/im_still_exploring_silly_tavern_question_about/>, <https://www.reddit.com/r/SillyTavernAI/comments/1ddjbfq/data_bank_an_incomplete_guide_to_a_specific/>, <https://docs.sillytavern.app/usage/core-concepts/data-bank>.

---

## 6. Characters and world

Recommended guides: World Info Encyclopedia (<https://rentry.co/world-info-encyclopedia>), Trappu's character writing guide (<https://wikia.schneedc.com/bot-creation/trappu/creation>), Kingbri's Ali:Chat + PLists guide (<https://rentry.co/kingbri-chara-guide>), and chub.ai (low average quality but "has EVERYTHING").

Best format (as in the default **Seraphina** card): a **PList** plus **Ali:Chat**. Kingbri's example:

PList:
```
[Manami's persona: extroverted, tomboy, athletic, intelligent, caring, kind, sweet, honest, happy, sensitive, selfless, enthusiastic, silly, curious, dreamer, inferiority complex, doubts her intelligence, makes shallow friendships, respects few friends, loves chatting, likes anime and manga, likes video games, likes swimming, likes the beach, close friends with {{user}}, classmates with {{user}}; Manami's clothes: mint-green blouse, denim shorts, flats; Manami's body: young woman, fair-skinned, light blue hair, short hair, messy hair, blue eyes, magenta nail polish; Genre: slice of life; Tags: city, park, quantum physics, exam, university; Scenario: {{char}} wants {{user}}'s help with studying for their next quantum physics exam. Eventually they finish studying and hang out together.]
```

Ali:Chat:
```
{{user}}: Appearance?
{{char}}: I have light blue hair. It's short because long hair gets in the way of playing sports, but the only downside is that it gets messy plays with her hair... I've sorta lived with it and it's become my look. looks down slightly People often mistake me for being a boy because of this hairstyle... buuut I don't mind that since it helped me make more friends! Manami shows off her mint-green blouse, denim shorts, and flats This outfit is great for casual wear! The blouse and shorts are very comfortable for walking around.
```

This teaches the LLM both how the character speaks and its facts. Character lorebooks and world lore are best kept in the same format.

**Note:** in group scenarios, do **not** use `{{char}}` in shared lorebooks/presets (see §7).

---

## 7. Multi-character dynamics (group chats)

When Character A responds, the LLM receives everything **but only A's card**, and **every** `{{char}}` everywhere is substituted with A. Three problems and fixes:

1. **Global lorebook says `{{char}}` did something** → every character reads it as their own; personalities blend.
   **Fix:** use `{{char}}` only in the character's own card and own lorebooks (sent only with them).
2. **A knows nothing about B** except chat context.
   **Fix:** in shared lorebooks and the main prompt use **`{{group}}`** (expands to all characters in the chat, e.g. `Char A, Char B`). Describe characters and relationships in the scenario or lorebook, e.g.:
   ```
   <START>
   {{user}}: "What's your relationship with Moon like?"
   Sun: *Sun's expression softens with a deep, fond amusement.* "Moon? She is the shadow to my light, the question to my answer. She is my younger sister, though in stubbornness, she is ancient. She moves through the world's flaws and forgotten corners, while I watch for the grand patterns of the sunrise. She calls me naive; I call her cynical. But we are two sides of the same coin. Without her, my light would cast no shadow, and without me, her darkness would have no dawn to chase."
   ```
3. **B can't really leave** — even if they walk away in RP, they're still sent the entire chat.
   **Fix:** **Presence** extension + **mute** the character in the group chat panel; Presence marks the messages they can't see (you can also toggle this manually via the small circles on messages). Use **`{{groupNotMuted}}`** — returns only currently unmuted characters, whereas `{{group}}` always returns all.

References: the three Reddit group-chat threads in §12, <https://docs.sillytavern.app/usage/core-concepts/groupchats/>, <https://docs.sillytavern.app/usage/core-concepts/macros/>.

**Superseded (Oct 2025):** author abandoned group chats for a single merged multi-character card driven by a narrator. See also Frogster's **CostumeSwitch** tip in §11 for multi-sprite display in single-card chats.

---

## 8. Translations

- Author writes English at ~B1 while the model writes ~C2, so he translates. The default Chat Translation (even paid DeepL) was clumsy or broke formatting.
- Tested **10 models via OpenRouter** in **Magic Translation** using a custom translation prompt (the prompt was posted **only as a screenshot**, `2025-08-17_17-19.png` — its text is not in the scrape).
- Ranking: **Sonnet 4.0 = Sonnet 3.7 > GPT-5 > Gemma 3 27B >>>> Kimi = GPT-4.** Gemini missing from his notes; he recalls Flash being "just awful". Gemma 3 27B (local) did well, unlike Qwen/Mistral. Acknowledged as partly a prompt issue.
- He uses **Sonnet 3.7**; ~0.8 cents per message. (Screenshot of an English→Russian result shown.)
- Tip from `weather`: enable **previous messages** in Magic Translation's prompt so the model has context (shown as a screenshot of the default prompt).

---

## 9. Image generation (backgrounds, characters)

- Really consistent characters need a trained **LoRA** — typically **100–300 images** of the character/place/style. With one reference image there are workarounds with variable results. Any **SDXL** model makes great backgrounds from your last message with no extra setup.
- Tooling: **ComfyUI** ("love at first sight and… hate at first sight"). Models from **Civitai** ("Instagram for models") and **Hugging Face** ("git for models").
- **IP-Adapter** — style transfer from an image ("LoRA without training"). **IP-Adapter FaceID** — same with face matching.
- **ControlNet** — copy pose, clothing, anatomy; **Xinsir's** SDXL ControlNet models recommended (<https://huggingface.co/xinsir>).
- Basic flow:
  1. Pick a **Checkpoint** (base: FLUX / SDXL / SD1.5).
  2. Add a **LoRA** of the **same base type**.
  3. Feed into a **sampler** with positive + negative prompts, choosing sampler & scheduler.
  4. **IP-Adapter** steers toward your reference; **ControlNet** constrains structure (pose/edges/depth).
  All add-ons must match your checkpoint base — filter by base type on Civitai.
- **Inpainting** — replace part of an image (prompt-driven, or content-aware-fill style). Can be done in ComfyUI, but **Lama-Cleaner** (<https://huggingface.co/spaces/Sanster/Lama-Cleaner-lama>) is convenient for fixing fingers/artifacts and extending images (e.g. longer legs).
- Several result images and an early bad attempt were shown ("I am only showing THE results").

---

## 10. Character expressions via video generation (WAN)

- Goal: **~28 expressions** per character for Character Expressions. Without a LoRA, generating the same character from new angles fails, especially with picky styles (2.5D anime, oil portrait).
- Best simple path: **Incognit0ErgoSum's ComfyUI WAN workflow** (<https://www.reddit.com/r/SillyTavernAI/comments/1mkm0ry/comment/n85m7am/>) — animate one ideal portrait and extract frames as expression sprites.
- Hardware caveat: on a laptop 4090 (**16 GB VRAM**, ~desktop 4070 Ti) it ran only at **360p**, after juggling ComfyUI's Python dependencies. It either runs for about a minute and outputs a video, or doesn't run at all.
- Alternative: **Flux Kontext online** (<https://kontextflux.com/>, ~$10) to change emotions/appearance of a still image while keeping face/pose. Unverified by him at first.
  - `Stylendr`: Kontext is free for personal use / self-hosting — `kontext-dev` weights and GGUF quantizations are on Hugging Face.
  - `Leinstay`: true, but **dev is far worse than the website version**; he pays for tokens when he needs to add details (posted two examples showing added details with the rest preserved).
- Example videos: <https://i.imgur.com/CdM2RMt.mp4>, <https://i.imgur.com/iFTQs8V.mp4>, <https://i.imgur.com/EcokMos.mp4>, <https://i.imgur.com/ZVhLggk.mp4> (also attached to the thread as mp4s).

---

## 11. From the comments

### Extra extensions
- `Frogster` — **CostumeSwitch** (<https://github.com/archkrrr/SillyTavern-CostumeSwitch>): show multiple characters' expressions/images inside a **single character card** chat (e.g. a narrator card) without a group chat.
- `Frogster` — **SimTracker** (<https://github.com/prolix-oc/SillyTavern-SimTracker>): visual adventure/stat tracking for multiple characters. Custom HTML templates, styling, configurable code-block identifier (default `sim`), thought-bubble toggle, card colors with auto dark variants. Shipped with a dating-sim preset at the time; you can build your own.
- `Frogster` — **Rewrite extension** (<https://github.com/splitclover/rewrite-extension>): selecting text pops a context menu (outside edit mode), making deletion/rewrites much easier. `Leinstay`: "This one is gold" — he deletes entries constantly while retesting.
- `Frogster` — **WeatherPack** (<https://github.com/bmen25124/SillyTavern-WeatherPack>) may be needed to make the HTML prompt below work smoother.

### In-chat HTML "visuals" without image generation (`Frogster`)
Put this prompt in the system prompt or a very high-priority lorebook entry. With DeepSeek it rendered e.g. a smartwatch notification UI right where the character checked his watch. Attachment `HTLM.txt`, full contents:

```
<IMMERSIVE_HTML_PROMPT>

Core Mandate: Use creative HTML as a form of visual storytelling. Do this at every opportunity

Core Rules:

World Representation: HTML represents in-world objects (screens, posters, books, signs, letters, logos, insignias, crests, plaques, seals, medallions, coins, labels, etc.), but employ HTML/CSS for anything in-world which could be represented. These can be minor details or major; integrate interactive elements into your generation.

Thematic Styling: Use inline CSS to match the theme (e.g., sleek/digitized for sci-fi, rustic/antiquated for fantasy). Text must be in context (e.g., gothic font for a medieval charter, cursive for a handwritten note) and visible against the background. You have free reign to add things such as animations, 3D renderings, pop outs, hover overs, drop downs, and scrolling menus.

Seamless Integration: Place panels in the narrative where the characters would interact with them. The surrounding narration should recognize the visualized article. Please exclude jarring elements that don't suit the narrative.

Integrated Images: Use 'pollinations.ai' to embed appropriate textures and images directly within your panels. Prefer simple images that generate without distortion. DO NOT embed from 'i.ibb.co' or 'imgur.com'.

2
Creative Application: You have no limits as for how you apply HTML/CSS, or how you alter the format to incorporate HTML/CSS. Beyond static objects, consider how to represent abstracts (diagrams, conceptualizations, topographies, geometries, atmospheres, magical effects, memories, dreams, etc.)

Story First: Apply these rules to anything and everything, but remember visuals are a narrative device. Your generation serves an immersive, reactive story.

CRITICAL: Do NOT enclose the final HTML in markdown code fences (```). It must be rendered directly. 

</IMMERSIVE_HTML_PROMPT>
```
(The stray `2` line is in the original file.)

### Pacing control (`Ash` asked how the author changes story pace)
Three methods from `Leinstay`:
1. **Inline OOC** in your message:
   ```
   We went with Kate to the amusement park.

   (OOC: Describe the reaction only up to the moment of approaching the first attraction.)
   ```
   or
   ```
   (OOC: Describe story what we done for next two hours.)
   ```
2. **Nemo preset** for complex stories — "very weighty"; as the plot unfolds, toggle prompts for narrative speed, response size, genre, NSFW, etc. (screenshot of toggles shown).
3. Middle ground: **Author's Note** sent **as user at depth 0** — its contents get appended to your last message (screenshot of settings shown).

### Other
- `Stylendr` — original filebin pack link expired; author replaced it (see §12).
- `Geh` asked how to get premade videos/images into chats; he had done it with regex, but it's tedious and per-chat/character. The thread has **no substantive answer** (a later reply just said "look into" with nothing further).
- `NatahnB` asked for DM help; author offered it — nothing technical in-thread.

---

## 12. Links & resources

**Guide's own files**
- Updated files folder (OneDrive, per first message, "Files (updated)"): <https://1drv.ms/f/c/21344d661e3dc53e/EmHeTsZBe5RDjfL4s-cvQVwBYSyBBd3keaE2wPIkCoVKzQ?e=utDDFP>
- Original pack (expired as of Oct 2025): <https://filebin.net/6e6tl10ucc1ailjp> — contained: all lorebooks, characters and persona; an example chronicle (upload via Magic Wand → Data Bank → Chat Files, then Vectorize All); **Avalon** world lorebook (connect globally and as character auxiliary lorebook); **Main Prompt** (≈ his preset); **NSFW Bible** (enable globally, toggle manually for NSFW scenes); **Meta Framework** (scenario piece telling characters they're inside an LLM, attached as character auxiliary lorebook).
- Reddit version of the guide: <https://www.reddit.com/r/SillyTavernAI/comments/1msah5u/i_finished_my_stbased_endless_vn_project_huge/>

**General guides**
- <https://rentry.org/marinara-spaghetti> — Marinara preset + beginner guide ("small boy")
- <https://rentry.org/Sukino-Findings> — large guide collection ("big boy")

**Memory**
- <https://www.reddit.com/r/SillyTavernAI/comments/18agtc9/im_still_exploring_silly_tavern_question_about/> — memory discussion #1
- <https://www.reddit.com/r/SillyTavernAI/comments/1ddjbfq/data_bank_an_incomplete_guide_to_a_specific/> — Data Bank guide
- <https://docs.sillytavern.app/usage/core-concepts/data-bank> — ST docs
- <https://github.com/aikohanasaki/SillyTavern-MemoryBooks> — ST Memory Books (author's later recommendation)

**Extensions** — see §3 and §11 for all repo links.
- <https://github.com/city-unit/st-extension-example> — extension template
- <https://docs.sillytavern.app/for-contributors/writing-extensions/> — extension docs

**Presets**
- <https://www.reddit.com/r/SillyTavernAI/comments/1maiava/chatstream_v2_per_model_presets_kimi_deepseek/> — eteitaxiv ChatStream v2 presets (his base)
- Nemo preset — mentioned, no link given

**Characters & world**
- <https://wikia.schneedc.com/bot-creation/trappu/creation> — character writing guide
- <https://rentry.co/alichat> — Ali:Chat guide
- <https://rentry.co/plists_alichat_avakson> — PLists guide
- <https://rentry.co/kingbri-chara-guide> — Ali:Chat Lite (Ali:Chat + PLists)
- <https://rentry.co/world-info-encyclopedia> — World Info encyclopedia
- <https://chub.ai/> — character library

**Group chats**
- <https://www.reddit.com/r/SillyTavernAI/comments/1hjwk6e/best_way_to_handle_group_chats_is_not_to_use/>
- <https://www.reddit.com/r/SillyTavernAI/comments/18vfir2/group_chat_setup_silly_tavern/>
- <https://www.reddit.com/r/SillyTavernAI/comments/1f1ejhj/tips_on_creating_group_chats/>
- <https://docs.sillytavern.app/usage/core-concepts/groupchats/> · <https://docs.sillytavern.app/usage/core-concepts/macros/>

**Image / video**
- <https://civitai.com/> — model hub · <https://huggingface.co/> — model hub
- <https://huggingface.co/xinsir> — SDXL ControlNet models
- <https://huggingface.co/spaces/Sanster/Lama-Cleaner-lama> — online inpainting
- <https://www.reddit.com/r/SillyTavernAI/comments/1mkm0ry/comment/n85m7am/> — WAN expression workflow
- <https://kontextflux.com/> — Flux Kontext online (paid)
- <https://dreammir.ai/> — the commercial "endless world" site that inspired the project

**Discord attachments (images, not inlined)**
- Header image and several guide screenshots (`i-finished-my-st-based-endless-vn-project-…png/webp`): project overview, extensions panel, prompt inspection, lorebook entry, preset/prompt manager, character card example, translation result, generated backgrounds/characters and an early bad attempt.
- `2025-08-17_17-19.png` — the Magic Translation test prompt (text only in the image).
- 5 mp4s — WAN expression video examples.
- Frogster's `FE13K4C.png` (SimTracker UI), `XTKkMGI.png` (Rewrite extension menu), `image.png` (HTML smartwatch notification), `HTLM.txt` (inlined above).
- weather's `image.png` — Magic Translation default prompt with previous messages.
- Leinstay's Oct 2025 screenshots: STMB, two Flux Kontext examples, Nemo preset toggles, Author's Note depth-0 settings.
