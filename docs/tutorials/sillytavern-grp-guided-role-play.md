---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1309530998798680186
thread_id: "1309530998798680186"
forum_tags: ["Other"]
author: "Valden80"
created: 2024-11-22
last_activity: 2024-12-24
active_span_days: 32
upvotes: 7
reactions_total: 7
reactions: ["upvote 7"]
comments: 9
participants: 5
author_replies: 5
scraped: 2026-09-18
---
# SillyTavern — "GRP - Guided Role Play (True Table Top Sim)" Guide

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "GRP - Guided Role Play (True Table Top Sim)"
<https://discord.com/channels/1100685673633153084/1309530998798680186>
**Author:** `Valden80` (concept + all template files)
**Thread spans:** 22 Nov 2024 → 24 Dec 2024 (10 messages). Scraped 18 Sep 2026.

---

## 0. TL;DR — what this actually does

A different way to roleplay in SillyTavern: you don't play a character at all. There is **no `{{user}}` persona** in the fiction — instead you are an out-of-fiction "Player" issuing short **commands** ("Stand up", "Drink health potion", "Tell X about Y") to the character card, which acts as a **Dungeon Master (DM)** narrating what happens when that command is attempted, exactly like a tabletop RPG (D&D, GURPS, etc.) or an old text adventure game, but AI-driven. The command is a *request*, not a stated fact — the DM decides and narrates the outcome.

Delivered as three importable SillyTavern template bundles (Context + Instruct + System Prompt + Text Completion Preset in one JSON each, all named with a `[GRP]` prefix so they're easy to spot in ST's dropdowns), tuned for specific local 8B/12B models. Works best with a **good instruct-tuned local model** (Llama 3 8B class or Mistral Nemo 12B class); the author explicitly recommends against group chats for this setup.

---

## 1. The concept

- Normally in ST you roleplay *as* a character (or write "I do this" as a stated fact). In GRP, you never write in-fiction facts — you write **commands to your character**, and the character (really, the DM behind the curtain) reports back what happened.
- **No player avatar/persona is required.** The setup has no `{{user}}` character in the fiction at all — only a generic "Player" referenced in the system prompt, with no identity of its own.
  - Author still suggests creating a minimal persona named **"Player"** anyway, purely as a safety net in case of leakage into the output.
- **Character card guidance:** prefer clear, **third-person** descriptions, and write the card with **no mention of `{{user}}`** at all — this setup doesn't have a `{{user}}` as an in-fiction player character.
- **Command style:** short imperative commands — `"Stand up"`, `"Drink health potion"`, `"Tell X about Y"`.
- **Don't cheat the DM:** avoid commands that dictate the outcome, e.g. *"...and it shall be a success!"* — that's cheating the DM role, not issuing a command.
- **Group chats:** the author notes this setup "work[s] awful" in ST's group chat mode — stick to single-character chats.
- **Recurring NPCs:** if you need semi-permanent NPCs across a session, add them as **World Info (WI)** entries rather than as group members. The setup can generally be extended with WI, scripts, etc.
- **Continuing a cut-off turn:** the presets cap generation at `New tokens = 180`, so the character sometimes can't finish everything you commanded in one message. Press **Enter with an empty input** — this is treated as "continue doing what I requested before." Models handle roughly **3–4 consecutive empty continues** well.

---

## 2. Setup — step by step

1. **Import the attached settings** for your model tier (see §3 below) — each bundle contains a **Context template**, **Instruct template**, **System Prompt**, and a **Text Completion Preset**, all tagged `[GRP]` in their names so they're easy to tell apart from your normal presets.
2. **Pick a capable local model:**
   - **8B tier (Llama 3 class):** the author recommends the **Hathor series** (Hathor 0.5 is the author's favorite), **Niitama**, or **ArliAI**. Model tested for the final round: [`TheMelonGod/Llama-3.1-8B-ArliAI-RPMax-v1.3-exl2`](https://huggingface.co/TheMelonGod/Llama-3.1-8B-ArliAI-RPMax-v1.3-exl2) (author used the **8bpw** quant).
   - **12B tier (Mistral Nemo class):** **Violet Twilight** (specifically "Violet Twilight 0.2" is called out) — noticeably better than the 8B models at **multi-character scenes**: the author reports taking an NPC companion along on an adventure, fighting an enemy together, meeting a third character, and having group interaction "without any mess up."
3. **Character card:** simple or complex is fine, but keep it in clear third-person prose, with **no reference to `{{user}}`** anywhere in the card.
4. Optionally set up a minimal "Player" persona (see §1) as a leakage safety net — not required.

---

## 3. The template bundles

Three Discord-attached JSON files, each a full ST "master" export containing `instruct` + `context` + `sysprompt` + `preset` (Text Completion) sections. Import via the normal ST import flow for that settings type; all four sub-items share the `[GRP]` naming prefix.

### 3.1 `GRP_for_L3_8B.json` — Llama 3 8B tier

For Llama-3-instruct-format models (Hathor / Niitama / ArliAI RPMax and similar).

**Instruct template — `[GRP] Llama 3 Guiding RP`**
```
input_sequence:   <|start_header_id|>user<|end_header_id|>\n\nPlayer's command is: 
output_sequence:  <|start_header_id|>assistant<|end_header_id|>\n\nResult is: 
system_sequence:  <|start_header_id|>system<|end_header_id|>\n\n
stop_sequence:    <|eot_id|>
output_suffix:    <|eot_id|>
input_suffix:     <|eot_id|>
system_suffix:    <|eot_id|>
wrap: false · macro: true · names_behavior: none · names_force_groups: true
system_same_as_user: true
```

**Context template — `[GRP] Llama 3 Instruct+`**
```
story_string:
{{#if system}}<|start_header_id|>system<|end_header_id|>\n\n{{system}}\n<|eot_id|>{{/if}}{{#if wiBefore}}<|start_header_id|>system<|end_header_id|>\n\n##Lore and history:\n{{wiBefore}}\n<|eot_id|>{{/if}}{{#if description}}<|start_header_id|>system<|end_header_id|>\n\n##Main character:\n{{description}}\n{{#if personality}}#{{char}}'s personality: {{personality}}{{/if}}\n<|eot_id|>{{/if}}{{#if scenario}}<|start_header_id|>system<|end_header_id|>\n\n##Scenario: {{scenario}}\n<|eot_id|>{{/if}}{{#if wiAfter}}<|start_header_id|>system<|end_header_id|>\n\n##Additional data:\n{{wiAfter}}\n<|eot_id|>{{/if}}\n
```

**System prompt — `[GRP] Guiding RP`**
```
You are AI Game System, a simulator of the Dungeon Master for the  Adventure table top games.

You task is lead the game by sticking to the game playing process:

1. Player write you a command what to do (try to do). 
2. You as the Dungeon Master, processing this command in the role of the {{char}} and writing back the actual result of what  is happened at the trying to executing command by the {{char}} and how other characters and environment reacted.
3. Next turn.

- Player is not actual character in the game, it is a gamer who playing with you. Don't mention him in the game, don't mention that {{char}} is commanded.
- {{Char}} shall be overall passive and do only what is Player commanded to do. Without initiative.
-Don't rush scenes forward without command form the Player.
-Use asterisks for *the character's actions*.
-Use quotes when character's talks.
```

**Text Completion preset — `[8B][12K] GRP ArliAI`** (key values; full sampler set in the raw JSON)
```
temp 0.7 · temperature_last true · top_p 1 · top_k 0 · min_p 0.125
rep_pen 1 (rep_pen_range 2048) · dry_multiplier 0.8 · dry_base 1.75
dry_sequence_breakers: ["\n", ":", "\"", "*"]
add_bos_token true · genamt (New tokens) 180 · max_length (context) 12288
sampler_priority: repetition_penalty, presence_penalty, frequency_penalty, dry, temperature,
  dynamic_temperature, quadratic_sampling, top_k, top_p, typical_p, epsilon_cutoff, eta_cutoff,
  tfs, top_a, min_p, mirostat, xtc, encoder_repetition_penalty, no_repeat_ngram
```
Original attachment: `GRP_for_L3_8B.json` (Discord CDN, fetched and inlined above; content confirmed live).

### 3.2 `GRP_for_12B_Violet_Twilight.json` — Mistral Nemo 12B, v1 (superseded, see §3.3)

For Mistral V3-Tekken-format 12B models (e.g. Violet Twilight).

**Instruct template — `[GRP] Mistral V3-Tekken Guided RP`**
```
input_sequence:   [INST]</s> Player's command is: 
output_sequence:  [/INST]</s>\nResult is: 
user_alignment_message: Let's get started. Please respond based on the information and instructions provided above.
system_same_as_user: false · wrap: false · macro: true · names_behavior: none
```

**Context template — `[GRP] Mistral V3-Tekken+`**
```
story_string:
[INST]{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}### Lore and history:\n{{wiBefore}}\n{{/if}}{{#if description}}### Main character:\n{{description}}\n{{#if personality}}\n{{personality}}\n{{/if}}\n{{/if}}{{#if scenario}}### Scenario:\n{{scenario}}\n{{/if}}{{#if wiAfter}}### Additional data:\n{{wiAfter}}\n{{/if}}{{trim}}[/INST]Understood.</s>\n
```

**System prompt — `[GRP] Guiding RP`**
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
Note this system prompt is meaningfully longer than the L3 8B one: it explicitly states `{{char}}` must never appear aware of being commanded or of being an in-game character — the L3 version omits that clause.

**Text Completion preset — `[12B][12K] GRP Violet Twilight`**: same sampler profile as §3.1 (temp 0.7, min_p 0.125, dry_multiplier 0.8, dry_base 1.75, genamt 180, max_length 12288).

### 3.3 `GRP_for_12B_Mistral_Violet_Twilight_v2.json` — v2, tweaked and fixed (supersedes 3.2)

Posted 25 Nov 2024, three days after v1. **Author's instructions: delete the v1 templates in ST first — the new file reuses the exact same names** (`[GRP] Mistral V3-Tekken Guided RP` / `[GRP] Mistral V3-Tekken+` / `[GRP] Guiding RP` / `[12B][12K] GRP Violet Twilight`), so importing v2 without removing v1 will create duplicates. Author states: "Previous version don't have any benefits" — **always prefer v2 for the 12B/Mistral tier.**

What actually changed vs. v1 (verified against the raw JSON, the rest is byte-identical):
- `input_sequence` gained an explicit character reference: `[INST]</s> Player's command is: ` → `[INST]</s> Player's command for {{char}} is: `
- Preset gained one additional sampler field, `nsigma: 0` (present in v2, absent in v1 — likely just a newer ST export).

Author's note on the improvement: "increased compatibility for multi-character scenes" — see the NPC-companion example in §1/§2.

Also mentioned in the same message: the author was still experimental at this point and considered making **ChatML-format** templates later (no evidence in the rest of the thread that this happened).

---

## 4. From the comments

### 4.1 Instruct-format correctness debate (`lazarus123`, `Valden80`, `Inspector Caracal`)

- **`lazarus123`** flagged that the Mistral Nemo 12B instruct formatting looks wrong against the documented format. Documented (per their research):
  ```
  <s>[INST] {user_message1}[/INST] {assistant_reply1}</s>[INST] {user_message2}[/INST] {assistant_reply2}</s>
  ```
  vs. what the GRP templates actually produce:
  ```
  [INST] {user_message1}[/INST] {assistant_reply1}</s>[INST]</s> {user_message2}[/INST]</s> {assistant_reply2}
  ```
- **`Valden80`** (author) acknowledged it may not match the docs exactly but said it works "as is" for the intended purpose — no leaking of "Player" into the generated text. He said he originally started from the exactly-documented variant and it performed *worse* than his current v2 (the model would sometimes address "Player" directly by name). He called the effect of `</s>` placement "affecting it for sure, but very unpredictable" and said he'd keep experimenting.
- **`Inspector Caracal`** added a technical clarification: the `</s>` token in Mistral models is the model's own signal that *its own* generated message is complete — **it should not be placed inside the user/instruction section** of the prompt template, which is effectively what the non-standard placement above does.
- No further follow-up in the thread resolves this — treat the non-standard `</s>` placement as an intentional (if debated) empirical choice by the author, not a documented best practice.

### 4.2 Other comments

- **`FusselNerd4711`** — thanked the author, reports the guide/templates work well.
- **`chai`** — asked if there were any screenshots of this in action. **Unanswered** — this is the last message in the thread (24 Dec 2024).

No later messages in the thread report the guide as outdated or broken on newer SillyTavern versions — the thread simply goes quiet after `chai`'s question.

---

## 5. Links & resources

- Hugging Face model used for the author's final 8B tests: [`TheMelonGod/Llama-3.1-8B-ArliAI-RPMax-v1.3-exl2`](https://huggingface.co/TheMelonGod/Llama-3.1-8B-ArliAI-RPMax-v1.3-exl2) (author used the 8bpw exl2 quant).
- `GRP_for_L3_8B.json` — Discord attachment, 8B/Llama-3 template bundle. Fetched and inlined in §3.1 (still live, 200 OK, 5603 bytes).
- `GRP_for_12B_Violet_Twilight.json` — Discord attachment, 12B/Mistral template bundle, **v1 (superseded)**. Fetched and inlined in §3.2 (still live, 200 OK, 5532 bytes).
- `GRP_for_12B_Mistral_Violet_Twilight_v2.json` — Discord attachment, 12B/Mistral template bundle, **v2 (current)**. Fetched and inlined in §3.3 (still live, 200 OK, 5566 bytes).

All three attachment URLs were live Discord CDN links at scrape time (fetched directly, no CORS/expiry issues encountered).
