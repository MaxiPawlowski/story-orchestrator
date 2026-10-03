# Memory model

The memory model reads the chat after each reply. It decides whether the story can move on, writes the memories,
and keeps summaries. It is a second connection, separate from the model that writes the replies (it can be the same
backend).

## Choose one

1. In SillyTavern, make a **Connection Manager** profile for the model you want (Text Completion or Chat
   Completion). Give it an **instruct template** that matches the model: without one, many local models answer the
   memory model's prompts with loops of repeated tokens.
2. In **Extensions → Story Orchestrator → General setup → Memory model — this install**, pick it under **Memory
   model profile**.
3. Press **Test memory model**. It asks the model a few sample questions and says what passed.

"Let the story advance on its own" must be on (it is by default). The choice affects every chat, including new ones.

## Options in the same group

- **Fallback when it is down**: another profile that takes over while the memory model does not answer. It is
  re-checked every few minutes and switches back on its own.
- **Reply thinking**: how long the *main* chat model may think before each reply in a story chat: Off, Low (128
  tokens), Medium (400 tokens, recommended), High (no cap). Applied only on llama.cpp backends whose setup thinks;
  other backends get nothing and the panel says why.
- **Models per task**: send some tasks to a different profile, for example a bigger model for summaries:

  | Task | Covers |
  |---|---|
  | Story reads | the after-reply read that moves the story |
  | Summaries and canon | scene summaries, chapter summaries, the story so far |
  | Wizard and road ahead | the setup wizard and generated scenes |
  | Speaker direction | who speaks next in a group |
  | World Info curator | proposed lorebook updates |
  | Inner voice | characters' private thoughts |

  A task left on "Same as memory model" uses the profile above. A task can also go to a coding-agent login on the
  server through the [harness plugin](harness.md).
- **Advanced**: how often the story reads (cadence), how hard it re-checks a stuck scene, and how many messages it
  stays behind. The defaults are fine for nearly everyone.

## When changes apply

What a read finds is applied at the **next** turn boundary, after the next reply has finished; one scene change
happens per turn, by design. Reads normally run every reply and include the newest message (swipes are handled by
stepping back and reading again). A transition with an `extractor_trigger` cue forces a read the moment its cue
appears in the chat, so decisive beats land without waiting: give your decisive transitions a cue.

## What it costs

One read per reply on the memory model, plus occasional summaries. Reads happen after the reply is shown, so they
never delay it. With a local model, a read competes with the next reply for the GPU.

---

[Setup](README.md)
