# Memory model

The memory model reads the chat after each reply. It decides whether the story can move on, writes the memories,
and keeps summaries. It is a second connection, separate from the model that writes the replies (it can be the same
backend). It needs reliable instruction following more than good prose; see [Choosing models](models.md).

## Choose one

1. In SillyTavern, make a **Connection Manager** profile for the model you want (Text Completion or Chat
   Completion). Give it an **instruct template** that matches the model: without one, many local models answer the
   memory model's prompts with loops of repeated tokens.
2. In **Extensions → Story Orchestrator → Memory → Memory model — this install**, pick it under **Memory
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
  | Lore creation | new lorebook entries the curator proposes (defaults to the curator's profile) |
  | Inner voice | characters' private thoughts |

  A task left on "Same as memory model" uses the profile above. A task can also go to a coding-agent login on the
  server through the [harness plugin](harness.md).

  Every profile list is grouped by provider and labelled **local** (this machine or your network) or **cloud**. A
  task on a cloud profile says what it sends, and to whom, under its picker.
- **Advanced**: how often the story reads (cadence), how hard it re-checks a stuck scene, and how many messages it
  stays behind. The defaults are fine for nearly everyone.

## Use a cloud model for a task

Any task can run on a cloud provider SillyTavern supports, with the key kept on the SillyTavern server.

1. In SillyTavern, connect to the provider under **Chat Completion** (for example DeepSeek), enter its API key, and
   pick the model.
2. Save it as a **Connection Manager** profile. Make one profile per provider and model. A profile remembers which
   saved key it uses, so two accounts or two endpoints can sit side by side.
3. Pick that profile for the task under **Models per task**. Tasks you leave alone keep the memory model.

Worked example: the DeepSeek API, one Chat Completion profile, used for every task while the replies stay on a local
model. Claude and ChatGPT subscriptions work only through the [harness plugin](harness.md) (opencode), never as a key.
OpenRouter is another way to reach many models with one key; any Chat Completion source works the same way.

Each task sends its own part of the story to the provider you pick for it: the line under each task says what.
Speaker direction and the inner voice run before a reply, so give them a fast model.

### How much the model is sent

The memory model's input is sized to the profile's context:

1. the **settings preset**'s context size, when the profile names a preset that has one;
2. otherwise the model's known context, for models SillyTavern lists (OpenAI, Google, xAI);
3. otherwise the provider's known context (DeepSeek 131,072 tokens, Claude 200,000, OpenAI, Google and xAI 128,000);
4. otherwise 8,192 tokens. **Setup → Host capabilities** shows which one applied and why.

A Text Completion profile always uses its preset's context size. For a Custom (OpenAI-compatible) endpoint or
OpenRouter, give the profile a settings preset with the right context size.

## When changes apply

What a read finds is applied at the **next** turn boundary, after the next reply has finished; one scene change
happens per turn, by design. Reads normally run every reply and include the newest message (swipes are handled by
stepping back and reading again). A transition with an `extractor_trigger` cue forces a read the moment its cue
appears in the chat, so decisive beats land without waiting: give your decisive transitions a cue.

**Tool calling.** With Chat Completion function calling on (for example an extension that gives the model tools), one
player turn can render a reply, a tool call and a continuation. Each rendered reply is its own turn boundary, so one
player turn can move the story's tension and extraction cadence more than once and fire one transition per step.
Swipes, edits and deletes still roll back correctly, tool-call messages included. Not measured: how much this changes
pacing in play. If a story feels rushed with tools on, compare a turn with tools off and report it.

## What it costs

One read per reply on the memory model, plus occasional summaries. Reads happen after the reply is shown, so they
never delay it. With a local model, a read competes with the next reply for the GPU.

---

[Setup](README.md)
