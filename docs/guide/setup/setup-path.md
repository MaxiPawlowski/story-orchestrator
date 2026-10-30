# Setup path

Every part of Story Orchestrator in the order worth setting it up. Each level builds on the one before; stop wherever
the story plays the way you want. **Every feature is on by default**, so most steps are "check it works", not "switch
it on". New to the extension? Start with the [Quick start](../quick-start.md).

Each step says what it does, what it costs, where it is and how to check it. Inside SillyTavern, **Show me** points at
the control. Open this page from **Settings → Help → Setup path**. The workspace pages are **Settings →
Library, Features, Models, Judge, Images & stage, World & lore, Display, Authoring, Diagnostics, Help** and **This chat →
Play, Settings** (Review and Author in Author view).

1. [Level 0: required](#level-0-required): a group chat and a memory model.
2. [Level 1: reliable play](#level-1-reliable-play): clean replies, lore only in the chats that use it.
3. [Level 2: the judge](#level-2-the-judge): faster, more careful small choices. Optional.
4. [Level 3: the authoring model](#level-3-the-authoring-model): the wizard and Ask on a strong model.
5. [Level 4: presentation](#level-4-presentation): pictures and character sprites. Optional.
6. [Level 5: feature defaults](#level-5-feature-defaults): each feature tuned for every chat.
7. [Level 6: author-side](#level-6-author-side): per-story and per-chat choices, and review.

## Level 0: required

### A group chat

- **What it does:** lets a story start at all. Stories play only in group chats whose members are the story's cast.
- **Cost:** none.
- **Where:** a SillyTavern group, then **Settings → Library** to import or start a story.
- **How to check:** no **Make a group for this story** card, and nothing about groups in the repair card.
  <!-- so:show player:library -->

### The memory model

- **What it does:** reads the chat after each reply, so the story moves on, remembers and summarizes by itself.
- **Cost:** one memory model call every 3 replies.
- **Where:** **Settings → Models → Memory model**. Pick a **Connection Manager** profile saved with the
  instruct template that matches its model; without it many local models loop.
- **How to check:** the red **fix setup** chip on the strip above the chat box clears.
  <!-- so:show setup:memory -->

### Test the memory model

- **What it does:** tells you whether the model can track the story and who knows what.
- **Cost:** a handful of calls, once.
- **Where:** **Settings → Models → Test memory model**.
- **How to check:** a list of what passed. A model that cannot keep private knowledge apart is offered a switch-off
  for that part. <!-- so:show setup:test -->

More: [Memory model](memory-model.md).

## Level 1: reliable play

### Reply model and preset

- **What it does:** replies in character, inside the context the server holds.
- **Cost:** your reply model's usual cost.
- **Where:** SillyTavern's own connection and preset; checked in **Settings → Diagnostics → Host capabilities**.
- **How to check:** Host capabilities shows the memory model's context, and no repair row says a request is larger
  than the server holds. <!-- so:show open:orchestrator.diagnostics.so-capabilities -->

The extension was tested on Artemis 31B v1.1 over Text Completion with thinking on, the preset's context set to
what the server holds (32,768 on a 24 GB card): [What we tested on](models.md#what-we-tested-on).

### Reply thinking

- **What it does:** a bounded think before each reply, so replies stay clean and start sooner.
- **Cost:** up to 400 thinking tokens per reply at **Medium** (Low 128, High no cap). Only llama.cpp setups that think.
- **Where:** **Settings → Features → Reply thinking → Thinking effort**, default **Medium**.
- **How to check:** no repair line says characters' intentions are not tracked because the model is not thinking.
  <!-- so:show setup:feature -->

### Lore settings

- **What it does:** story lore switches on only in the chats that play that story.
- **Cost:** no model calls.
- **Where:** **Settings → World & lore → How story lorebook entries switch on** (advanced), default **Per chat**.
  **Memory-triggered lore** and **Late lore placement** in **Settings → Features** stay on.
- **How to check:** no repair row about entries left switched on, or about a story's lorebook selected for every
  chat. <!-- so:show open:orchestrator.world.so-wi-gating-mode -->

### A fallback for the memory model (optional)

- **What it does:** reads continue through an outage and switch back on their own.
- **Cost:** calls only while the memory model is down.
- **Where:** **Settings → Models → Fallback when it is down**.
- **How to check:** during an outage the Play page says another model is standing in.
  <!-- so:show open:orchestrator.models.so-extraction-fallback -->

## Level 2: the judge

The judge is a small, fast model for short choices, such as who speaks next. It never blocks a reply. More:
[Judge](judge.md).

### Install the judge plugin

- **What it does:** lets the judge answer at all.
- **Cost:** none until a key is saved.
- **Where:** on the SillyTavern machine, `npm run plugin:install` (judge and lore plugins), `enableServerPlugins:
  true` in `config.yaml`, then restart SillyTavern. Status shows in **Settings → Judge**.
- **How to check:** the status line says whether the plugin answers. <!-- so:show open:orchestrator.judge.so-judge-status -->

### Save the judge key

- **What it does:** turns the judge's uses on.
- **Cost:** small calls to TypeSafe per use; two uses run before a reply, within 1.5 s.
- **Where:** **Settings → Judge → TypeSafe API key**, then **Save key**. Type it yourself: it is
  kept in SillyTavern's secrets on the server and never shown again.
- **How to check:** the status line says the judge is ready. <!-- so:show setup:judge -->

### What the judge is used for

- **What it does:** each use answers one kind of question, so the slower usual path runs less often.
- **Cost:** one small call per use when it runs.
- **Where:** **Settings → Judge → What the judge is used for**; **Test the judge** below it. Every
  use is on and says what it sends; untick one you do not want sent.
- **How to check:** the heading counts the uses that are on, and the test reports each one.
  <!-- so:show open:orchestrator.judge.so-judge-uses -->

## Level 3: the authoring model

The wizard and Ask want a strong tool-calling model, not a roleplay model. More: [Choosing models](models.md),
[Harness](harness.md).

### The harness plugin

- **What it does:** runs the wizard on opencode or Claude Code, on your subscription instead of a per-token bill.
- **Cost:** your subscription's usage.
- **Where:** `npm run plugins:install -- --with harness`, offer the harness in its `config.json`, sign in on the
  server, restart. Then **Settings → Models → Models per task**.
- **How to check:** each task lists the harness under **Cloud harness (on the SillyTavern server)**, without "(log in
  first)". <!-- so:show open:orchestrator.models.so-role-profiles -->

### The wizard's model

- **What it does:** stories built through reliable tool calls.
- **Cost:** gpt-6.1-sol takes about 25 s per Ask answer and about half an hour per wizard run, on the subscription.
- **Where:** **Settings → Models → Models per task → Wizard and road ahead**. Left on its default it uses
  opencode `openai/gpt-6.1-sol` when the harness offers it, else the first DeepSeek profile (paid per token past its
  quota), else the memory model.
- **How to check:** the select names its default as "Default: …", and no repair row reports a model outage.

### The wizard and Ask switches

- **What it does:** the Studio's wizard, its suggestions, Ask in Help and `/story ask`.
- **Cost:** a few calls per question; a wizard run while you build.
- **Where:** **Settings → Help → Enable the wizard** and **Ask questions**, both on.
- **How to check:** **New story (wizard)** in the Library opens the wizard, and Help shows an Ask box.
  <!-- so:show open:orchestrator.authoring.so-copilot-enabled -->

A story with no briefing gets one written by this model: one call per new story in a chat.

## Level 4: presentation

Pictures are allowed on a new install and drawn only at story moments. While no service is ready they are skipped
without an error and the repair card says why. More: [Illustrations](images.md), [Sprite packs](sprites.md),
[One GPU for text and images](gpu-sharing.md).

### An image service

- **What it does:** illustrations at the moments each story asks for.
- **Cost:** one render per picture.
- **Where:** SillyTavern's Image Generation source, then **Settings → Images & stage → Image backend** and
  **Test render**.
- **How to check:** the test picture appears as its own message. <!-- so:show open:orchestrator.images.so-image-backend -->

### Character sprites

- **What it does:** characters on stage, their faces following the reply.
- **Cost:** an expression pick per reply: the judge, else the expression model.
- **Where:** a sprite pack per character (`characters/<name>/`), and **Settings → Features → Character stage**.
  The stage starts on **Automatic**: it shows when a story directs it.
- **How to check:** the stage shows in Visual Novel mode (`/vn`), or always with **Show stage** set to Always.
  <!-- so:show open:orchestrator.images.so-sprite-enabled -->

### One GPU for text and pictures

- **What it does:** a local text model and local pictures take turns on one graphics card.
- **Cost:** no model calls; replies wait while a picture renders.
- **Where:** `npm run plugin:install -- --with gpu`, a `config.json` with `"adapter": "observe"` to start, restart.
  Status shows near **Settings → Images & stage**.
- **How to check:** the repair card no longer says pictures and the local text model share one GPU with nothing
  taking turns. Only needed for a local text model and local pictures on the same card.

### Advanced ComfyUI recipes (optional)

- **What it does:** per-purpose models, sprite edits and changed looks.
- **Cost:** GPU renders; a model download only after you confirm its card.
- **Where:** `npm run plugin:install -- --with media`, restart; then **Image backend → Advanced ComfyUI recipes** and
  the ComfyUI address.
- **How to check:** **Test render** draws through ComfyUI, and setup names any model still needed.

## Level 5: feature defaults

**Settings → Features** holds one card per feature. Each switch is the default for every chat, and off there is a
master switch. A story can turn a feature off for itself, and **This chat → Settings** can change it for one chat.
Every feature is on by default; the character stage is on in its automatic form. <!-- so:show setup:defaults -->

| Feature | What it does | Cost | Turn it off when |
|---|---|---|---|
| **Story reading** | Reads replies to track facts and story progress. | One memory model call every 3 replies. | You want to move the story by hand in Author view. |
| **Prompt memory** | Adds remembered facts to character prompts. | No call of its own. | You are testing a model with nothing remembered in its prompt. |
| **Chapters and long-chat context** | Records finished chapters and keeps their history in a bounded prompt. | A few memory model calls when a chapter ends. | You want every old message kept in the prompt. |
| **Continuity** | Restates established facts when a reply contradicts them. | One judge call after each character reply. | You have no judge key, or do not want replies sent to it. |
| **Player agency** | Reminds replies to leave your actions and decisions to you. | Shares the continuity judge call. | Characters may act and speak for you in this story. |
| **Tension and pacing** | Guides replies toward the story's tension curve. | No model call. | You want replies without that nudge. |
| **Reply thinking** | Sets the thinking budget for character replies on a supported local backend. | Up to 400 thinking tokens per reply at Medium. | Your model does not think, or you want the fastest replies. |
| **Living continuation** | Writes the next turning point from a living premise. | Authoring model calls at the last written turning point. | A living story should stop at its last written turning point. |
| **Adaptive branches** | Prepares a way forward when your choices leave the planned routes. | Authoring model calls when you go off script. | The story should keep to its written routes. |
| **Prepare a route ahead** | Prepares one adaptive route before it is needed. | One background authoring call per turning point. | Your authoring model is paid per token and you rarely go off script. |
| **Speaker direction** | Chooses who should answer in a group scene. | A short pick before replies: the judge, else its own model. | You prefer SillyTavern's own turn order. |
| **Several voices per turn** | Lets several characters answer before it is your turn. | Each extra voice is another reply, up to 3. | You want one character to answer at a time. |
| **Private inner voice** | Prepares private intent for the next speaker. | Up to two memory model calls per turn, never while you wait. | Your memory model is slow or paid per token. |
| **Reply polish** | Checks the sentences of a reply that use words a character would not use, or keep repeating, and records what a rewrite in their voice would change. This build never edits the chat. | One call to the Reply polish route (sol by default, never the play model) per reply with a finding, at most 40 an hour. | You do not want replies sent to the polish route. |
| **Voice and delivery** | Tells each character privately how they word things, and steers them off phrases they keep repeating. | About 120 tokens in each drafted character's prompt; no model call. | You are comparing replies with and without voice sheets. |
| **Reactive cues** | Hands a character one authored cue, privately, when something it would notice happens or you ask it about a topic. | One short line in the drafted character's prompt when a cue applies; no model call. | You are comparing replies with and without cues, or a story's cues read wrong. |
| **Delayed echoes** | Lets something that happened come back later: after a delay, if the story still fits, one character or the narrator is handed one authored cue about it, once per chat. | One short line in that character's prompt when an echo lands; no model call. | You are comparing replies with and without echoes, or a story's echoes land at the wrong moment. |
| **Promises remembered** | Remembers promises you make to a character, in your words. | A few extra lines in each story read. | You do not want promises tracked. |
| **Who heard what** | Notes which characters heard each message. | A few extra lines in each story read. | You want the shortest possible reads. |
| **Rumors and gossip** | Passes a story's rumors between characters as hearsay. | No model call. | News should reach characters only on stage. |
| **Story patterns** | Notices an order of events the player saw and shows the story's callback line. | No model call. | What changed should list only single changes. |
| **Off-stage events** | Proposes events toward the plans a story gives its characters. | One memory model call when the story moves on or a scene ends. | Characters should act only on stage. |
| **Current character state** | Adds public character changes to replies without editing cards. | No model call. | Cards should be read exactly as written. |
| **Lorebook curator** | Proposes changes to the lorebooks a story permits. New entries always wait for review. | Background curator calls. | A lorebook should never change during play. |
| **Memory-triggered lore** | Lets public memories activate lorebook entries. | No model call. | Lore fires on remembered words you do not want. |
| **Late lore placement** | Places changing story lore near recent messages so the prompt start stays the same. | No model call. | Your lore must sit beside the character card. |
| **Illustrations** | Draws story moments after the text has finished. | One render per picture. | You have no image service, or the GPU is busy. |
| **Character stage** | Shows the speaking characters and their expressions. | An expression pick per reply. | You never want the stage. |
| **Character poses** | Uses the story's body-pose library on the stage. | Body renders on ComfyUI when a pose is needed. | You have no ComfyUI pose setup. |

The judge checks behind a feature are listed on that feature's card and switched in **Settings → Models →
Judge**. Every control is listed in the [Settings reference](settings-reference.md).

## Level 6: author-side

Author view spoils the story it is turned on in, so it asks first. More: [Writing a story](../author/README.md).

### Author view

- **What it does:** shows tracked values, the scheduler, the next prompt and review cards, for one chat.
- **Cost:** none.
- **Where:** **This chat → Author → Show author view**, then confirm.
- **How to check:** extra tabs for the story's state, the background work and the next prompt appear, for this chat only. <!-- so:show author:author-view -->

### A story's own feature choices

- **What it does:** each story runs with the features it was written for.
- **Cost:** none.
- **Where:** **Settings → Library → Open Studio**, the story's [feature policies](../author/fields/story.md#feature-policies).
- **How to check:** **This chat → Settings** says "Turned off by this story" on a declined feature.
  <!-- so:show author:studio -->

### One chat's preferences

- **What it does:** tries a setting in one chat without touching the install or the story.
- **Cost:** whatever the feature costs.
- **Where:** **This chat → Settings**, any feature row. A feature off in **Settings → Features** cannot be turned on for one
  chat.
- **How to check:** the source chip says **This chat**; **Reset to story/default** puts it back.

### Review proposals

- **What it does:** lorebook changes and continuity notes you accept, applied at the end of the next reply.
- **Cost:** none beyond the curator's own calls.
- **Where:** **This chat → Review**, in Author view.
- **How to check:** an accepted change applies at the end of the next reply, and a rollback reverts it.
  <!-- so:show author:review -->

---

[Setup](README.md)
