# Memory model

The memory model reads the chat every few character replies (every three by default). It decides whether the story
can move on, writes the memories, and keeps summaries. It is a second connection, separate from the model that writes the replies (it can be the same
backend). It needs reliable instruction following more than good prose; see [Choosing models](models.md).

## Choose one

1. In SillyTavern, make a **Connection Manager** profile for the model you want (Text Completion or Chat
   Completion). Give it an **instruct template** that matches the model: without one, many local models answer the
   memory model's prompts with loops of repeated tokens.
2. Open **Extensions → Story Orchestrator → Open Story Orchestrator → Settings → Models**, and under
   **Memory → Models and routing** pick it as the **Memory model**.
3. Press **Test memory model**. It runs fixed scenes through the real pipeline and says what passed.

**Story reading** must be on (it is by default: **Settings → Features → Story reading**). The choice affects every
chat, including new ones. It worked when **This chat → Play** stops asking for a memory model and its Status line
reads "Following along.".

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
- **How often it reads**: **Read every … replies** (default 3) and **Leave newest … replies out** (default 0) are on
  **Settings → Features → Story reading**, and for one chat on **This chat → Story settings → Story reading**. The
  defaults are fine for nearly everyone.

## Use a cloud model for a task

Any task can run on a cloud provider SillyTavern supports, with the key kept on the SillyTavern server.

1. In SillyTavern, connect to the provider under **Chat Completion** (for example DeepSeek), enter its API key, and
   pick the model.
2. Save it as a **Connection Manager** profile. Make one profile per provider and model. A profile remembers which
   saved key it uses, so two accounts or two endpoints can sit side by side.
3. Pick that profile for the task under **Models per task**. Tasks you leave alone keep the memory model.

Worked example: the DeepSeek API, one Chat Completion profile, used for every task while the replies stay on a local
model. Claude and ChatGPT subscriptions work only through the [harness plugin](harness.md) (Claude Code or opencode), never as a key.
OpenRouter is another way to reach many models with one key; any Chat Completion source works the same way.

Each task sends its own part of the story to the provider you pick for it: the line under each task says what.
Speaker direction and the inner voice can run while a reply waits, so give them a fast model
([Costs and waiting](README.md#costs-and-waiting)).

### How much the model is sent

The memory model's input is sized to the profile's context:

1. the **settings preset**'s context size, when the profile names a preset that has one;
2. otherwise the model's known context, for models SillyTavern lists (OpenAI, Google, xAI);
3. otherwise the provider's known context (DeepSeek 131,072 tokens, Claude 200,000, OpenAI, Google and xAI 128,000);
4. otherwise 8,192 tokens. **Setup → Host capabilities** shows which one applied and why.

A Text Completion profile always uses its preset's context size. For a Custom (OpenAI-compatible) endpoint or
OpenRouter, give the profile a settings preset with the right context size.

## When changes apply

By default the story read runs every three character replies and includes the newest message (swipes are handled by
stepping back and reading again). Other things can ask for a read sooner: a scene change, a cue the story's author
wrote for a decisive moment, a stuck scene being re-checked, and an edit or swipe. What a read finds is applied after
the **next** reply finishes; one scene change happens per reply, by design. So a story can take a few replies to react,
and that is normal; **This chat → Story settings → Story reading → Read now** reads straight away.

**Tool calling.** With Chat Completion function calling on (for example an extension that gives the model tools), one
player turn can render a reply, a tool call and a continuation. Each rendered reply counts as its own reply, so one
player turn can move the story's tension and read cadence more than once and change scene once per step.
Swipes, edits and deletes still roll back correctly, tool-call messages included. Not measured: how much this changes
pacing in play. If a story feels rushed with tools on, compare a turn with tools off and report it.

## What it costs

One story read every three character replies on the memory model, plus the extra reads above and occasional summaries.
Other tasks (inner voice, chapter records, briefings, the wizard) are separate calls, listed in
[Costs and waiting](README.md#costs-and-waiting). Reads happen after the reply is shown, so they do not delay it; with a
local model on the same GPU, a read competes with the next reply.

---

[Setup](README.md)
