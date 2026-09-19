# Prompting and memory: community prior art, compared with Story Orchestrator

**Scope.** This is what SillyTavern users actually do for narrator/GM-style roleplay prompting
(the GRP template bundle), for instruct/context/system-prompt bundles and presets, samplers and
reasoning-tag handling, pacing control, multi-character play, and long-term **memory**:
the built-in Summarize, chronicles in Data Bank + Vector Storage, lorebooks as a fact cache,
Memory Books, qvink per-message memory, state trackers, and Presence. Each section records the
problems users hit with it. The doc then maps each approach onto our memory tiers, pacing
steering, checkpoint engine and speaker direction, and says what we already cover and where the
gaps are.

**Read this when** you are writing or reviewing a memory-LLM / wizard / curator / director
prompt, changing memory tiers, injection or pacing, deciding how a new feature should coexist
with extensions users already run, or answering "how do people do X in ST today?"

**Not here** (link, don't duplicate): prompt-building mechanics are in the official docs
[instructmode.md](../instructmode.md), [context-template.md](../context-template.md),
[prompts.md](../prompts.md), [prompt-manager.md](../prompt-manager.md),
[data-bank.md](../data-bank.md), [Author's-Note.md](../Author's-Note.md) and
[groupchats.md](../groupchats.md). Card fields, PList/Ali:Chat and first messages are in
[`st-character-authoring`](../../skills/st-character-authoring/SKILL.md). World Info entry anatomy,
scan settings and WI tricks are in [`st-lorebook-authoring`](../../skills/st-lorebook-authoring/SKILL.md).
Regex JSON, STscript, QR and macro idioms are in [`st-scripting`](../../skills/st-scripting/SKILL.md).
Image generation, sprites and `/bg` are in [`st-image-generation`](../../skills/st-image-generation/SKILL.md).
DOM, CSS and VN mode are in [ui-dom-selectors.md](ui-dom-selectors.md).

**Citation convention.** ST paths are relative to `C:\dev\SillyTavern-MainBranch\` and `ext/`
means `public/scripts/extensions/`. Project paths (`src/…`) are relative to the extension root.
There are three markers. `(verified: …)` means checked in ST or project source. `(installed copy: …)`
means checked in a third-party extension that is installed in this ST tree (versions are in
Sources). `(community-reported, yyyy-mm)` means the claim was not checked.

---

## 1. Narrator/GM prompting: the GRP pattern

GRP ("Guided Role Play", Valden80) is the clearest community narrator design, and it maps closely
onto our narrator-driven engine.

### 1.1 The contract

- **The user is out of the fiction.** There is no `{{user}}` in the story. The user is a "Player"
  who issues short **commands** to the card's character ("Stand up", "Drink health potion",
  "Tell X about Y"). The model acts as the **Dungeon Master**. It narrates what happens when the
  character *attempts* the command, and how other characters and the environment react.
- **A command is a request, not a fact.** Don't write outcomes ("…and it shall be a success!").
  That cheats the DM.
- **The character is passive.** It does only what it is commanded, with no initiative, and
  scenes never move forward without a command.
- The card is written in third person with **no mention of `{{user}}`**. A minimal persona named
  "Player" is optional and is only a safety net against leakage.
- **Recurring NPCs go into World Info, not group members.** The author reports that the setup
  "works awful" in group chats.
- The 12B tier (Mistral Nemo, "Violet Twilight 0.2") handled **multi-character scenes inside one
  card**: an NPC companion, a fight, a third character, all in the same card. 8B models were weaker
  at this. (community-reported, 2024-11)

### 1.2 The bundle

A GRP bundle is one JSON file per model tier. It holds an instruct template, a context template,
a system prompt and a Text Completion preset, all named with a `[GRP]` prefix. Import it with
**Advanced Formatting → Master Import**, which recognizes the sections `instruct`, `context`,
`sysprompt`, `preset`, `reasoning` and `srw` (Start Reply With)
(verified: `public/scripts/preset-manager.js:117-190`, `:244`, button `#af_master_import` `:1220`).
Master Import also accepts a single-section legacy file: it detects instruct by
`name+input_sequence+output_sequence`, context by `name+story_string`, system prompt by
`name+content`, TC preset by `temp+top_k+top_p+rep_pen`, and reasoning by `name+prefix+suffix+separator`
(verified: `preset-manager.js:209-279`). A v2 bundle **reuses the v1 names**, so delete v1 first or
you get duplicates (community-reported, 2024-11).

**System prompt** `[GRP] Guiding RP` (the Mistral v2 version is kept verbatim because the wording
is the point; the Llama-3 version drops the three "unaware of Player" clauses):

```
You are AI Game System, a simulator of the Dungeon Master for the  Adventure table top games.

You task is lead the game by sticking to the rules of game playing process:

1. Player write you a command what to do (try to do).
2. You as the Dungeon Master, processing this command in a role of the {{char}} and writing back the actual result of what  is happened at the trying to executing command by the {{char}} and how other characters and environment reacted.
3. While playing {{char}} shall never behave like being aware of Player, being in-game character, and being commanded by Player.

- Player is not actual entity in the game, he is a gamer who playing with you as AI Game System. Don't mention Player in the game, and don't mention that {{char}} is commanded by Player.
- {{Char}} shall be overall passive and do only what is Player commanded to do. Without initiative.
- {{char}} is unaware of Player, or the fact of being in-game character.
-Don't rush scenes forward without command form the Player.
-Use asterisks for *the character's actions*.
-Use quotes when character's talks.
```

**Instruct sequences carry the framing.** The turn labels are part of the sequences themselves:

```
L3 8B:   input_sequence  = <|start_header_id|>user<|end_header_id|>\n\nPlayer's command is:
         output_sequence = <|start_header_id|>assistant<|end_header_id|>\n\nResult is:
         names_behavior: none · macro: true · wrap: false · system_same_as_user: true
Nemo v2: input_sequence  = [INST]</s> Player's command for {{char}} is:
         output_sequence = [/INST]</s>\nResult is:
         user_alignment_message = Let's get started. Please respond based on the information and instructions provided above.
```

- `macro: true` lets `{{char}}` expand inside a sequence (official "Replace Macro in Sequences").
  Nemo v2's only change from v1 was naming `{{char}}` in the command prefix, "for multi-character
  scenes" (community-reported, 2024-11).
- With `sequences_as_stop_strings` on (the default), prefixes become stop strings, so the model
  cannot write the Player's next command. It stops at `Player's command is:`
  (verified: `public/scripts/instruct-mode.js:47`, `:82`, `:342-349`).
- `names_behavior: none` means no name prefixes. The accepted values are `none`/`force`/`always`,
  and the default is `force` ("Groups and Past Personas")
  (verified: `instruct-mode.js:17-21`, `:81`). The exported `names_force_groups` key is
  **obsolete** and is stripped on load (verified: `instruct-mode.js:62-69`, `:93-96`).

**Context template:** the L3 story string wraps each block in its own system header and gives it
a heading: `##Lore and history:` (`{{wiBefore}}`), `##Main character:` (`{{description}}` plus
personality), `##Scenario:`, and `##Additional data:` (`{{wiAfter}}`). The Mistral version uses
`### …` headings inside a single `[INST]…{{trim}}[/INST]Understood.</s>` block.
Placeholder semantics are in [context-template.md](../context-template.md).

**Preset (the sampler dump is trimmed):** temp 0.7 with `temperature_last`, min_p 0.125,
rep_pen 1, DRY 0.8/1.75, **New tokens 180**, context 12288. A TC preset JSON carries `genamt`
(response length) and `max_length` (context size), so importing one silently changes both
(verified: `preset-manager.js:745-746`).

### 1.3 Pitfalls reported

- **Instruct-format correctness.** The Nemo bundle puts `</s>` inside user/instruction turns,
  which contradicts Mistral's documented `<s>[INST] … [/INST] … </s>` format. `</s>` is the
  model's own end-of-turn token. The author says the documented variant made the model address
  "Player" by name, so the deviation is empirical and unresolved (community-reported, 2024-11).
  Default rule: follow the model card's template unless an A/B shows otherwise. A *missing*
  template is worse than an imperfect one. See Implications §11.
- **Replies get cut off at 180 tokens.** The workaround is to press Enter on an empty input and
  let the model carry on. The author reports 3-4 consecutive empty sends working
  (community-reported, 2024-11). What ST does with an empty send in a solo chat is start a new
  `normal` generation with no user turn, so another `Result is:` block follows the last one.
  **"Send" to Continue** (`continue_on_send`, default off) instead extends the last message. It
  does not apply in groups (verified: `public/script.js:1744-1764`, `public/scripts/power-user.js:207`,
  `public/index.html:5390-5393`). Chat Completion users get the same effect from **Replace Empty
  Message** (`send_if_empty`) (verified: `public/scripts/openai.js:364`).

---

## 2. Prompt-stack craft beyond GRP

- **Presets are the main lever.** The most important step is the AI Response Configuration:
  the narrator role and the ordering of card, lore and history. Common starting points are
  Marinara (barebones, plug-and-play) and eteitaxiv's ChatStream v2 per-model presets. The
  consensus is that past generic use you need a **custom preset for your model and goals**
  (community-reported, 2025-08).
- **State the arc structure in the prompt.** Tell the model the story alternates
  *adventure → downtime for conversation → adventure*. Without this, DeepSeek "grabs you by the
  throat" and never lets characters sit and talk (community-reported, 2025-08). This is prior art
  for our `arc_template` / `tension_target` steering (§10).
- **Toggle-heavy presets** (the "Nemo" preset) keep narrative speed, response size, genre and
  content as separate Prompt Manager entries that are switched on and off as the plot moves
  (community-reported, 2025-10). This is the manual form of what our checkpoint effects do.
- **Inspect the actual prompt** before tuning. Use the per-message Prompt Itemization or the
  Prompt Inspector extension (see [prompts.md](../prompts.md)). Every request is rebuilt from
  scratch, so what is injected is the whole memory.
- **Persona as a behavior switch.** A persona whose description carries an instruction (e.g.
  "{{user}} needs everything explained in simple steps") can be swapped in for one reply instead
  of editing cards (community-reported, 2024-09).
- **In-chat HTML "visuals" without image generation.** A high-priority system/lorebook prompt
  tells the model to render in-world objects (screens, letters, signs) as inline-styled HTML at the
  moment characters interact with them, never inside code fences, with the narration
  acknowledging the object. The original is a ~20-line `<IMMERSIVE_HTML_PROMPT>` block. It is
  trimmed here because it also embeds external image URLs, a privacy concern (community-reported,
  2025-10). Rendering depends on `encode_tags` being off (§5); see
  [ui-dom-selectors.md](ui-dom-selectors.md).

---

## 3. Models and context (community notes, perishable)

- Hosted models (DeepSeek V3/R1, Gemini 2.5 Pro, Claude) were preferred over 7-13B locals for
  prose. One user's subjective ranking was Sonnet 3.7 > Sonnet 4.1 > Gemini 2.5 Pro > DeepSeek V3,
  with DeepSeek chosen on price. Local 8B/12B instruct finetunes remain the GRP target
  (community-reported, 2024-11 and 2025-08).
- **Usable context is smaller than advertised.** Quality degraded around 20k for DeepSeek V3
  despite a larger window (community-reported, 2025-08). This is why "control what is injected"
  beats "send more history".
- LLM translation (the third-party Magic Translation) beat the built-in **Chat Translation**
  (Google/DeepL). Giving the translator the previous messages as context helped
  (community-reported, 2025-08). The built-in extension id is `translate`
  (verified: `ext/translate/manifest.json:2`).

---

## 4. Samplers and output hygiene

- **Use one truncation sampler** (Top P, Typical P, Min P, Top A or TFS), not several. Keep
  **Top K** on at 80-200 and early in sampler priority, so later samplers don't scan the full
  distribution (community-reported, 2024-09).
- **A GGUF model that repeats the same sentence** usually has repetition penalty set too high.
  Above about 1.2 degrades output (community-reported, 2024-09).
- The GRP profile is temp 0.7 (applied last), min_p 0.125, rep_pen 1, DRY on. For comparison,
  the ST defaults are `temperature_last: true`, `top_k: 40`, `min_p: 0`, `dry_multiplier: 0`,
  `dry_base: 1.75` (verified: `public/scripts/textgen-settings.js:146-179`).
- **Trim Incomplete Sentences** (Advanced Formatting, `trim_sentences`, default off) drops a
  sentence cut off by the token cap (verified: `public/index.html:4237-4239`,
  `public/scripts/power-user.js:123`).

---

## 5. Reasoning and thinking tags

- **Display is not prompt.** User Settings → Chat/Message Handling → **Show `<tags>` in
  responses** is the `encode_tags` setting (default off). When it is on, `<…>` is HTML-escaped and
  shown literally. When it is off, the text is rendered as HTML, so unknown tags vanish from view
  (verified: `public/index.html:5451-5453`, `power-user.js:301`, `public/script.js:1875-1878`,
  `:1894-1897`). The message text, and so the next prompt, still contains the tags. That is also
  why "write hidden thoughts in `<…>`" works: the thoughts are hidden from the reader but not from
  the model (community-reported, 2024-09). To keep a tag out of the prompt, use a regex script with
  *Alter Outgoing Prompt* (see [`st-scripting`](../../skills/st-scripting/SKILL.md)).
- **When reasoning won't collapse into the reasoning block**, the model is emitting a tag other
  than the expected one. Go to Advanced Formatting → Reasoning, set **Prefix/Suffix** to the model's
  actual tags, and enable **Auto-Parse**, which needs both fields non-empty. The defaults are
  `<think>` / `</think>` with `auto_parse: false` (verified: `public/index.html:4561-4564`,
  `:4610-4616`, `power-user.js:274-284`).
- **Auto-Parse is chat-render-side only.** Extension requests through
  `ConnectionManagerRequestService` pull reasoning only from backend-separated fields. On
  Text Completion that means only OpenRouter and Ollama, so a llama.cpp/KoboldCpp/LM Studio model
  that writes `<think>…</think>` inline returns it inside `content`
  (verified: `public/scripts/reasoning.js:112-126`, `public/scripts/custom-request.js:137-144`).
  This affects us directly; see §11.
- **"Think in `<think>` tags" prompting did worse than a separate planning call.** The
  Stepped Thinking extension generates thoughts/plans in extra LLM calls before the reply
  (community-reported, 2025-08). Its current *Embedded* mode (the default for new installs) stores
  thoughts on the message and injects them as `STEPTHINK_THOUGHT_*` extension prompts. The
  deprecated *Separated* mode pushes a real chat message (`is_thoughts: true`) and emits
  `MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED` for it (installed copy:
  `ext/third-party/st-stepped-thinking/settings/settings.js:137`, `thinking/mode.js:98-99`,
  `:586-640`, `:1503`).

---

## 6. Pacing control

What users actually use, from lightest touch to heaviest:

1. **Inline OOC** in the user message, e.g. `(OOC: Describe the reaction only up to the moment of
   approaching the first attraction.)` or `(OOC: Describe what we did for the next two hours.)`.
   It scopes the next reply and can skip time (community-reported, 2025-10).
2. **Author's Note as user at depth 0.** The note lands after the last message, which is the
   strongest position (community-reported, 2025-10). Role, depth, position and frequency are all
   scriptable: `/note-role system|user|assistant`, `/note-depth`, `/note-frequency`,
   `/note-position before|after|chat` (verified: `public/scripts/authors-note.js:517`, `:533`,
   `:550`, `:567`). Placement semantics are in [Author's-Note.md](../Author's-Note.md).
3. **Preset toggles** (Nemo-style), switched as the plot moves (§2).
4. **Structural rules in the system prompt:** GRP's "don't rush scenes forward" and the
   adventure/downtime/adventure arc instruction (§1, §2).

The problem users hit is that all of this is **manual and per-turn**. Pacing drifts the moment
the user stops steering. With DeepSeek it drifts toward constant escalation (community-reported, 2025-08).

---

## 7. Multi-character: group chat vs one merged narrator card

**Group-chat problems and the fixes users apply** (community-reported, 2025-08):

| Problem | Why | Community fix |
|---|---|---|
| Personalities blend | Under the default *Swap character cards* mode, only the speaker's card is sent and **every** `{{char}}` everywhere becomes that speaker. A global lorebook saying "`{{char}}` did X" is read by everyone as their own. | Use `{{char}}` only in a character's own card and own lorebooks. |
| A knows nothing about B | B's card is not in A's prompt | In shared lorebooks and prompts use `{{group}}` (all members, including muted), and describe relationships in the scenario or a lorebook. |
| B can't leave the scene | Everyone is always sent the whole chat | Mute B, add **Presence**, and use `{{groupNotMuted}}` in shared text. |

- The macros exist as described. `{{notChar}}` (everyone except the speaker) is also useful for
  shared text (verified: `public/scripts/macros/definitions/env-macros.js:30-50`, legacy engine
  `public/script.js:2952-2953`).
- *Join character cards* (`group_generation_mode` APPEND / APPEND_DISABLED) puts every card in
  every prompt. The official docs warn it causes merged personalities
  (verified: `public/scripts/group-chats.js:129-132`, [groupchats.md](../groupchats.md)).
- **Presence** does not filter the prompt. On `GROUP_MEMBER_DRAFTED` it marks the **whole chat**
  hidden (`is_system = true`) except the ranges the drafted member was present for. It unhides
  everything again on `MESSAGE_RECEIVED` / `GENERATION_STOPPED`. A per-character "all-seeing"
  toggle serves narrators, and `/presenceForget|Remember…` commands edit memberships (installed copy:
  `ext/third-party/SillyTavern-Presence/index.js:236-282`, `src/js/eventListeners.js:10-20`,
  `README.md:32-47`; mechanism: `public/scripts/chats.js:147-169`). A side effect: the global
  unhide also reveals messages the user had hidden on purpose.
- **Where the community ended up:** Leinstay dropped group chats ("a hassle to chat with") for
  **one merged multi-character card driven by a narrator** (community-reported, 2025-10). GRP
  runs single-card with NPCs in World Info. CostumeSwitch shows several sprites inside a
  single-card chat (community-reported, 2025-10). Chat Completion's **Group Nudge** default is
  `[Write the next reply only as {{char}}.]` (verified: `public/scripts/openai.js:115`).

---

## 8. Memory approaches in the wild

The shared diagnosis (community-reported, 2025-08): the model remembers nothing. Each request is
rebuilt from the card, the prompt and whatever fits, so the only real levers are a bigger usable
context or **ruthless control of what is injected**.

### 8.1 Built-in Summarize (`ext/memory`, display name "Summarize")

- A rolling summary. The default prompt asks the model to take the existing summary "as a base and
  expand with new facts" within `{{words}}` words. It is injected as `[Summary: {{summary}}]`
  in-prompt, role system, depth 2. It updates roughly every 10 messages and targets 200 words.
  The source is `extras` / `main` / `webllm`. The slash command is `/summarize`
  (verified: `ext/memory/index.js:93-127`, `:1085`).
- The summary is **stored on a message** (`mes.extra.memory`). Deleting messages rewinds to the
  newest surviving summary, and editing or regenerating the last message drops its saved summary
  (verified: `ext/memory/index.js:357-369`, `:450-463`). The extension-prompt key is `1_memory`
  (verified: `:36`, `:965`).
- Leinstay used it only to *draft* chronicles and not for injection (§8.2). qvink's critique of it
  is (installed copy: `ext/third-party/qvink_memory/README.md:22-35`):
  - Summarizing everything at once misses details.
  - An LLM-maintained rolling summary drifts, and one bad generation can ruin it.
  - Chat edits don't reliably reach the summary.
  - Recent and important memories aren't kept apart.

### 8.2 Chronicles → Data Bank → Vector Storage (manual RAG)

The workflow (community-reported, 2025-08):

1. Summarize drafts diary-style "chronicles" with events, dates, times and places.
2. A human reviews and rewrites them into one text document.
3. The document is attached under **Magic Wand → Data Bank → Chat Files**.
4. **Vectorize All** is run in Vector Storage.

Each entry has an in-fiction header:

```
[Day 1, Morning, Wilderness Camp]
The discussion centered on the anomalous artifact. Moon revealed its runes were not standard Old Empire tech … Wolf confirmed the plan to go to the city first …
```

- Vector Storage defaults: chat vectorization injects `Past events:\n{{text}}` at depth 2 with
  protect 5, insert 3, query 2, score threshold 0.25. Data Bank chunks inject as
  `Related information:\n{{text}}` at depth 4. Both are off until enabled (verified:
  `ext/vectors/index.js:58-119`, keys `3_vectors` / `4_vectors_data_bank` `:52-53`, button
  `#vectors_vectorize_all` `:1868`). Scopes and providers are in [data-bank.md](../data-bank.md).
- The cost: quality equals chronicle quality, and the upkeep is manual. Leinstay replaced this
  workflow with Memory Books (community-reported, 2025-10).

### 8.3 Lorebooks as a fact cache (+ "memory inside the fiction")

- Key → fact entries for important facts, terms and memory fragments, "a canon facts cache with
  triggers" (community-reported, 2025-08). Entry craft is in
  [`st-lorebook-authoring`](../../skills/st-lorebook-authoring/SKILL.md).
- **Diegetic memory.** A lorebook entry keyed on memory words (`memory, forget, fade, forgotten,
  remember`) tells the characters that their world has finite memory and that "the Lorebook" is
  the only guaranteed record. Characters then sometimes ask the user to record things. This
  occasionally derails the story (community-reported, 2025-08).

### 8.4 Memory Books (aikohanasaki)

This was Leinstay's final recommendation after about 3k messages: best results with the easiest
maintenance (community-reported, 2025-10). Mechanism (installed copy, v3.2.7:
`ext/third-party/SillyTavern-MemoryBooks/readme.md`):

- The user marks scene start/end with ► ◄ on messages, then runs **Create Memory** or
  `/creatememory` (`:48-54`).
- The LLM must return **JSON only**: `{title, content, keywords}` (`:91-99`). Five built-in
  styles range from beat-by-beat to 1-2 sentences, and up to 7 previous memories can be sent as
  context (`:102-107`, `:147`).
- Each memory becomes a **lorebook entry** in the chat-bound book or a chosen book. It carries a
  `stmemorybooks` flag, is auto-numbered, and uses activation *Vectorized / Constant / Normal*
  (`:114-123`, `:159`; flags set in `addlore.js:146-156`). Vectorized entries are retrieved by
  Vector Storage's WI mode (verified: `ext/vectors/index.js:1659`, WI field
  `public/scripts/world-info.js:2716`).
- It is **Chat Completion only** (`readme.md:27`, gate at `index.js:307`). Memories are only
  pulled in if global WI settings allow, so the recommendation is scan depth ≥ 4 and whole-word
  matching off (`readme.md:29-35`).
- Problems: scene marking is manual; a model that fails JSON produces no memory; scenes must not
  overlap (`:216-223`).

### 8.5 qvink per-message memory (`qvink_memory`)

(installed copy, v1.2.7: `ext/third-party/qvink_memory/README.md`)

- Each message is **summarized individually**, and the summary is stored on that message, so
  editing or deleting a message only affects its own memory (`:17-35`).
- **Short-term** memory is the most recent summaries within a token budget. **Long-term** memory
  is summaries the user marked with the "brain" icon, under a separate budget. Summaries can be
  edited, re-summarized or force-excluded (`:19-20`, `:39-42`).
- **It reclaims context.** Summarized originals can be removed from the prompt past a threshold
  (`:49`, `:83`), through a `generate_interceptor` (`manifest.json:12`).
- It supports a separate connection profile and preset for summaries, but it **switches the
  global connection profile/preset** while summarizing, so unsaved preset edits are lost
  (`README.md:69`).

### 8.6 State trackers

StatSuite, SimTracker and Tracker keep structured state (outfit, location, stats) in or beside
messages. StatSuite's reported failures: it loses the persona, it **merges locations** ("in two
cities at once"), and it produces odd custom entries. These are blamed on its small default
model, and manual mode is advised. Short-term state such as the current outfit is increasingly
handled by the main model anyway (community-reported, 2025-08). SimTracker renders stat cards
from a configurable code block (default `sim`) (community-reported, 2025-08). Kaldigo's Tracker
is installed here (v0.0.2) and its docs are external.

### 8.7 Problems users hit, consolidated

- Advertised context overstates usable context. Long chats lose detail silently.
- LLM rolling summaries drift and are not tied to the messages they summarize.
- The good results all involve **human curation**: rewriting chronicles, marking scenes,
  "brain"-marking messages. Automatic trackers mis-merge state.
- Retrieval only works if lorebook/vector settings cooperate (scan depth, whole words,
  thresholds). Memories silently fail to load otherwise.
- JSON-structured memory needs a model that follows JSON. Memory Books drops Text Completion
  entirely.
- In groups, knowledge isolation needs Presence-style chat mutation plus careful macros.
- Extensions switching the *global* connection profile collide with the user's own settings.

---

## 9. Extension landscape (only what touches story, memory, character or narration)

**Built-in** (display names verified in each `ext/<id>/manifest.json:2`):

| Id | Display name | Relevance |
|---|---|---|
| `memory` | Summarize | Rolling summary (§8.1) |
| `vectors` | Vector Storage | Chat / Data Bank / WI vectorization (§8.2) |
| `attachments` | Data Bank (Chat Attachments) | RAG documents ([data-bank.md](../data-bank.md)) |
| `connection-manager` | Connection Profiles | Second-LLM calls; we use its `ConnectionManagerRequestService` |
| `quick-reply`, `regex` | Quick Replies, Regex | Automation and output hygiene ([`st-scripting`](../../skills/st-scripting/SKILL.md)) |
| `expressions`, `stable-diffusion`, `caption` | Character Expressions, Image Generation, Image Captioning | See [`st-image-generation`](../../skills/st-image-generation/SKILL.md) |
| `translate` | Chat Translation | Google/DeepL translation |

**Third-party:** "installed" means the copy was checked in this tree; the rest are
community-reported, 2025-08 to 2025-10.

| Extension | What it is | Status here |
|---|---|---|
| Memory Books | Scene-marked JSON summaries into lorebook entries | installed v3.2.7 |
| qvink_memory | Per-message short/long-term summaries | installed v1.2.7 |
| Presence | Per-member message visibility in groups | installed v3.1.1 |
| Stepped Thinking | Pre-reply thinking/planning calls; root id `#stepthink_settings` (our settings root was renamed to avoid it, see `.claude/rules/gotchas.md`) | installed v3.2.0 |
| Tracker (Kaldigo) | State tracking | installed v0.0.2 |
| Chat Top Bar (Cohee) | Quick-action bar | installed |
| StatSuite / SimTracker | State and stat tracking | community-reported |
| Guided Generations | Steer another character's reply; guided impersonate | community-reported |
| CostumeSwitch | Multiple sprites in a single-card chat | community-reported |
| Group Expressions (Lenny Suite) | Multiple sprites in groups | community-reported |
| Magic Translation | LLM translation with model choice | community-reported |
| Rewrite | Select-to-rewrite/delete context menu | community-reported |

---

## 10. Prior art vs Story Orchestrator

| Community approach | Our counterpart | Status |
|---|---|---|
| GRP DM narrator; user commands, model decides outcomes | Checkpoint graph + gates evaluated from **extracted evidence** (`src/extraction/contract.ts:37-41`), one transition per boundary | Covered. The engine decides progression, not the user's claims. Speaker-weighting of evidence is a gap (§11). |
| "Don't rush scenes", adventure/downtime arc instruction, Nemo pacing toggles | `arc_template` curves (`src/pacing/shapes.ts:5-9`), per-checkpoint `tension_target`, steering hint injected at depth 2 (`src/pacing/steering.ts:19-41`) | Covered, and automatic instead of per-turn manual |
| OOC / Author's Note depth-0 nudges | Checkpoint `author_note` effect, one-turn copilot nudge (`story_copilot_nudge`) | Partial: the AN `role` field is not applied (§11) |
| Preset swapping per plot phase | Checkpoint `preset` effect (`src/runtime/effectsApplier.ts:51-60`) | Partial: Text Completion presets only |
| Recurring NPCs in WI; merged narrator card | Roster, `cast_changes`, `npc_replies`, WI effects | Partial: roster and speaker logic resolve against ST **groups** (`src/runtime/roster.ts:10-21`) |
| Group problems: `{{char}}` bleed, knowledge isolation, leaving | Facts tier scoped to the active speaker (`src/memory/inject.ts:22`), epistemic tier with private per-draft injection (`memoryCoordinator.onMemberDrafted`, `src/runtime/coordinators/memoryCoordinator.ts:442-454`), `talk_control` speakers/lead/director/silence | Covered for knowledge; message-level hiding (Presence) is deliberately not our approach |
| Summarize rolling summary | `short_term` rolling compaction (one entry, replaced, watermarked) + `session_details` | Covered. Swipe/edit/delete rolls memory back by message (`memoryCoordinator.rollbackFromMessage`, `memoryCoordinator.ts:257-267`). |
| Chronicles (dated, located diary) | `scene_history` summaries at auto-detected scene breaks (`time_skip/location/divider/cast`, `src/memory/types.ts:27`), canon, arcs | Covered automatically, without the human rewrite pass |
| Memory Books (scene → lorebook entry with keywords) | WI mirror of relationships and scene summaries into a per-chat book `Story Orchestrator - <title> - <chatId>`, bound to the chat (`src/runtime/memoryMirror.ts`) | Covered. Scene boundaries are detected instead of marked. |
| qvink mark/exclude/edit | Drawer memory curation: pin / exclude / edit (`setMemoryPinned`, `excludeMemoryEntry`, `editMemoryEntry`) | Covered |
| qvink "remove summarized messages from context" | None: tiers add tokens and never replace history | Gap (§11) |
| Vector retrieval (chat vectors, vectorized WI, Data Bank) | Budgeted scoring (importance, recency, entity overlap, lexical similarity; `src/memory/score.ts:18-30`, `:61`). ST vectors are used only for consolidation dedup (`src/services/stHost/vectors.ts:25-42`). | Partial: no embedding-based retrieval for injection |
| State trackers (StatSuite etc.) | Typed blackboard qualities with latching + ledger `[state:Entity:type]` with `[retire]` supersession and single-writer quality binding | Covered, and typed. Watch for the same "two cities" merge in unbound ledger fields. |
| Stepped Thinking planning call | Off-path beat expansion (`src/generation/`), never on the response path | Different trade-off: we keep the reply path LLM-free |
| Separate model for summaries (qvink, Memory Books) | Connection Manager profile per call via `sendRequest(profileId, …)`, which does **not** switch the global profile (`src/services/stHost/connectionProfiles.ts:44-55`) | Covered, without qvink's global-switch problem |

---

## 11. Implications for Story Orchestrator

These are observations, not plans. Items marked *by inspection* were read from source and not
exercised live.

- **Reasoning-tag leakage in memory-LLM calls (by inspection).** A thinking model on a
  Text Completion backend other than OpenRouter/Ollama returns `<think>…</think>` inside `content`
  (§5). `stripChannelNoise` handles Harmony channel tokens and a leading `<tag>` per line, but not
  a multi-line think block (`src/extraction/parse.ts:9-21`). Free-text passes (scene summary,
  short-term, canon) would keep the reasoning as memory text, and line-parsed passes could pick up
  drafted `DELTA` lines from inside the reasoning. No `think` handling exists anywhere in `src/`.
- **The Author's Note `role` is silently dropped.** `effectsApplier` maps `author_note.role`, but
  `applyCharacterAN` only issues `/note-position`, `/note-depth` and `/note-frequency`, never
  `/note-role` (`src/services/stHost/authorNotes.ts:13-38`; the host command exists at
  `authors-note.js:567`). So the community's strongest nudge, *user at depth 0*, can be authored
  but not delivered.
- **Evidence doesn't weigh who said it.** GRP's rule that the user's text is a *request* is
  exactly where extraction can be gamed. A quote from the user's own "…and it succeeds" satisfies
  "directly supported by quoted evidence".
- **Narrator/merged-card play is the community's end state, and our per-character features are
  group-bound.** In a solo narrator-card chat the active speaker resolves to null. Facts-tier
  scoping, per-draft epistemic swap and `talk_control` then have nothing to act on, and one
  generation voices every character.
- **Coexistence.** Users who already run Summarize, Vector Storage chat vectors, qvink or Memory
  Books get a second memory stream alongside our tiers: duplicated recall and budget contention,
  undetected. Presence rewrites `is_system` across the whole chat on each draft, and our
  `getChatWindow` skips `is_system` messages (`src/extraction/chatWindow.ts:8`), so a read that
  overlaps a group draft sees one member's view. Stepped Thinking's Separated mode emits
  reply-rendered events for thought messages *without a type*. `TurnBridge` drops only `first_message`
  and `extension` (`src/runtime/turnBridge.ts`), so the thoughts still count as turns and enter
  extraction windows.
- **Context reclamation.** qvink's strongest idea is replacing summarized history instead of only
  adding summaries. That is the lever for "usable context < advertised" (§3), and we have none.
- **Retrieval.** The community is converging on vectorized recall (Memory Books, vectorized WI).
  Our injection selection is lexical. The embedding backend is already wired, but only for dedup.
- **Things the community pays for with manual work that we do automatically:** scene detection,
  chronicle writing, fact extraction, pacing steering, and per-character knowledge. That
  difference is the pitch. The human-curation step users trust (rewriting, marking) maps to our
  drawer curation, and it should stay prominent.

---

## Project hooks

- Memory tiers, types, epistemic tags, scene-break reasons: `src/memory/types.ts:1`, `:27`, `:51`.
- Injection: `src/memory/inject.ts`, key/depth registry `src/constants/injectionRegistry.ts:11-18`
  (facts 4, session 3, short_term 2, scene_history 6, epistemic 4, ledger 3, pacing 2). Every
  injection is written in-chat, as the system role, with `scan=false`
  (`src/services/stHost/extensionPrompts.ts:19-26`). ST's own keys to keep in mind are `1_memory`,
  `3_vectors` and `4_vectors_data_bank`.
- Memory-LLM transport: `src/services/stHost/connectionProfiles.ts:44-55`. It sends a message
  array so the profile's **instruct template** applies, and reads `content` only. The profile's
  context template and system prompt are **not** used for these calls (host:
  `ext/shared.js:465-483` passes only `profile.instruct` + `profile.preset`). A wrong or missing
  instruct template on the profile was the plan-13 ship-blocker; the GRP `</s>` debate (§1.3) is
  the same failure class.
- Output cleanup: `src/extraction/parse.ts:9-21` (`stripChannelNoise`).
- Pacing: `src/pacing/steering.ts`, `src/pacing/shapes.ts`. Author's Note and preset effects:
  `src/runtime/effectsApplier.ts:26-60`, `src/services/stHost/authorNotes.ts`,
  `src/services/stHost/presets.ts`.
- Group and speaker logic: `src/runtime/roster.ts`, `src/runtime/talkControl.ts`, `src/talk/*`.
  The draft hook is `GROUP_MEMBER_DRAFTED` → `src/runtime/index.ts:105`, the same event Presence uses.
- Chat reads and turn detection: `src/extraction/chatWindow.ts`, `src/runtime/turnBridge.ts`.
- WI mirror: `src/runtime/memoryMirror.ts`. Vectors backend:
  `src/services/stHost/vectors.ts`.
- When writing wizard/curator/director prompts, reuse GRP's structure: explicit role, a numbered
  turn protocol, "what the user is", and negative rules phrased as behavior. Also reuse its
  "headed blocks" context layout (§1.2). For narrator-card stories where the user is out of the
  fiction, the card rules (no `{{user}}`, third person) live in
  [`st-character-authoring`](../../skills/st-character-authoring/SKILL.md).

---

## Sources

| Source | URL | Created → last activity | ⬆ | Comments |
|---|---|---|---:|---:|
| GRP - Guided Role Play (True Table Top Sim), Valden80 | <https://discord.com/channels/1100685673633153084/1309530998798680186> | 2024-11-22 → 2024-12-24 | 7 | 9 |
| Lein's Beginner's Guide: Introduction to ST (extensions, memory, image/video generation), Leinstay | <https://discord.com/channels/1100685673633153084/1406653968477851760> | 2025-08-17 → 2026-06-19 | 53 | 68 |
| Community Quick Tips [contribute yours!], wit et al. | <https://discord.com/channels/1100685673633153084/1286355628314333335> | 2024-09-19 → 2025-07-25 | 20 | 37 |

The local dumps are `docs/tutorials/sillytavern-grp-guided-role-play.md`,
`sillytavern-leins-beginners-guide-intro-to-st.md` and `sillytavern-community-quick-tips.md`
(scraped 2026-09-18). The guide's own October 2025 update supersedes its chronicle workflow and
its group-chat advice. Both are kept above as history users still meet.

Installed third-party copies read for verification (`ext/third-party/`, last commit):
SillyTavern-MemoryBooks 3.2.7 (2025-09-02), qvink_memory 1.2.7 (2025-08-17),
SillyTavern-Presence 3.1.1 (2025-08-16), st-stepped-thinking 3.2.0 (2025-02-22),
SillyTavern-Tracker 0.0.2 (2025-07-26), Extension-TopInfoBar 1.0.0 (2025-06-13).
