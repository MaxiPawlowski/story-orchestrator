# Choosing models

Story Orchestrator gives different jobs to different models. One model can do all of them, but each job wants
something different, so splitting them is usually better and often cheaper.

| Job | What it does | What matters | Example | Where to set it |
|---|---|---|---|---|
| **Replies** | Writes what the characters say. | Prose, voice, staying in character, a long context. An RP or storytelling finetune is a good fit. | TheDrummer's Artemis 31B | SillyTavern's own connection (the chat model) |
| **Memory model** | Reads the chat after each reply: story facts, memories, summaries, whether a scene is over. | Following instructions and strict output formats, not prose flair. Needs its instruct template. | DeepSeek (Chat Completion) | **Memory → Memory model profile** |
| **Judge** | Answers short yes/no and pick-one questions: who speaks next, which lore matters, is this memory real. | Speed (two uses run before a reply, with a 1.5 s budget). | TypeSafe's Jev, through the judge plugin; experimental: decider-4b on this machine ([local judge](judge.md#local-judge-experimental)) | **Judge** section ([Judge](judge.md)) |
| **Wizard and road ahead** | Builds stories from a premise through tool calls, and writes generated scenes. | Reliable tool calling and planning. | DeepSeek | **Memory → Models per task → Wizard and road ahead** |
| **Image prompts** | Turns a scene into a picture prompt. Optional. | Short, literal output. | any small instruct model | **Images → Image-prompt model** ([Illustrations](images.md)) |

An RP finetune is a poor wizard. It is tuned to stay in a scene and write prose, so it tends to narrate instead of
calling a tool, invent arguments, or drift from the plan; the wizard needs a model that follows a tool schema exactly.

**Models per task** can also split the memory model's work: **Story reads**, **Summaries and canon**, **Speaker
direction**, **World Info curator**, **Lore creation** and **Inner voice**. Give the ones that run before a reply
(Speaker direction, Inner voice) a fast model. A task left on "Same as memory model" uses the memory model. How to
add a cloud profile: [Memory model](memory-model.md#use-a-cloud-model-for-a-task).

**One model for everything** works as a fallback: point the memory model at your reply model and leave the rest on
their defaults. You lose speed (every read competes with the next reply), some accuracy on reads and summaries, and
the wizard's reliability; without the judge plugin its uses take their ordinary, slower paths.

**A local judge** (decider-4b, about 6 GB of disk with its Python environment, in `dev/models/so-judge` on the system drive by
default) can stand in for TypeSafe per use, so nothing leaves the machine. It is not measured yet, so every use routed
to it keeps its usual path until it is: [Local judge](judge.md#local-judge-experimental).

## What we tested on

The extension was battle-tested on **TheDrummer's Artemis 31B v1.1**, GGUF Q4_K_M on llama.cpp's `llama-server`,
through a **Text Completion** profile. Every floor and measurement in this guide was taken on that setup. Other
models work, but they have not been measured.

| Setting | Value |
|---|---|
| Instruct and reasoning template | Gemma 4 (thinking on, the thought opened after the speaker's name) |
| Reply thinking | **Medium**: a 400-token thinking budget per reply (Off sends a budget of 1) |
| Sampler | temperature 1, `min_p` 0.05 moved first in the sampler order, DRY 0.8 over the last 4096 tokens, adaptive-P off |
| Context | 196,608 tokens shared by 4 slots with a q8_0 KV cache on a 32 GB GPU (98,304 per request); a 32K, one-slot setup on a 24 GB card for lighter checks |
| Memory model | DeepSeek over Chat Completion, with Artemis as the fallback |

Why:

- **v1.1 was kept** after blind comparisons with v1.2 and two other 24–31B finetunes: v1.1 and v1.2 tied on prose,
  and v1.2 barely thinks (it closed its thought at once in 14 of 16 replies).
- **Thinking stays on** because blind ratings ranked it above no thinking, once the prompt really opens the thought.
- **400 tokens** won the budget ratings: as clean as unlimited thinking, with a shorter tail. 128 was too tight for
  group scenes.
- **The sampler is fixed** because the defaults failed: adaptive-P at 0.25 merged and corrupted words, and DRY at
  `dry_penalty_last_n` 0 (which switches DRY off on llama.cpp) let phrase loops run. `min_p` first removes the mangled
  words that penalties caused by pushing the right word below the filter.
- **The thought opens after the name.** With thinking switched on but the prompt ending on the speaker's name, the
  model never opened a thought and its replies degraded; with the thought opened after the name they were clean.

Text Completion is the tested and rated route. Chat Completion works with this model but is not tuned or rated yet;
it needs `chat_template_kwargs.enable_thinking` set in the profile's additional parameters (or replies can come back
empty), SillyTavern's group nudge on, and **Character Names Behavior** set to "Message Content".
