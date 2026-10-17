# Setup path

A stepped way to turn on and configure every part of Story Orchestrator, one level at a time. Each level builds on
the one before; stop wherever the story plays the way you want. **Every feature is on by default**, so most steps
are "check it works", not "switch it on".

The same path runs inside SillyTavern as the tour's **Setup path** view: **Orchestrator → Help → Setup path**, or
`/story tour setup`. Each step there has an **Open this setting** button that opens the workspace at the control, and
an example you can try that never changes your chat or settings. New to the extension? Start with the
[Quick start](../quick-start.md).

Where a step names a control, the id in brackets is the control's element id, for bug reports and the
[Settings reference](settings-reference.md). The workspace pages are **Orchestrator → Library, Defaults, Connections,
Interface, Help** and **This story → Play, Features, Review, Author**.

| Level | What you get | Needs |
|---|---|---|
| [0: required](#level-0-required) | A story that follows play | A group chat and a memory model |
| [1: reliable play](#level-1-reliable-play) | Clean replies, lore in the right chats | Your reply connection |
| [2: the judge](#level-2-the-judge) | Faster, more careful small choices | The judge plugin and a TypeSafe key |
| [3: the authoring model](#level-3-the-authoring-model) | The wizard and Ask on a strong model | The harness plugin, or a DeepSeek profile |
| [4: presentation](#level-4-presentation) | Pictures and character sprites | An image service; the GPU plugin for one local card |
| [5: feature defaults](#level-5-feature-defaults) | Each feature tuned for every chat | Nothing new |
| [6: author-side](#level-6-author-side) | Per-story and per-chat choices, review | Author view |

## Level 0: required

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **A group chat** | A story can start at all. | A SillyTavern group with the story's cast, then **Orchestrator → Library** (`so-entry-points`) | No **Make a group for this story** card; Repair says nothing about groups. | None |
| **The memory model** | The story moves on, remembers and summarizes by itself. | **Orchestrator → Connections → Memory model** (`so-extraction-profile`) | The red **fix setup** chip on the story strip clears; **Pick a memory model** is done in Getting started. | One memory model call every 3 replies |
| **Test the memory model** | You know whether the model can track who knows what. | **Connections → Test memory model** (`so-self-test`) | A list of what passed; a model that cannot track private knowledge is offered a switch-off. | A handful of calls, once |

The memory model is a **Connection Manager** profile with the instruct template that matches its model. Without
the template many local models loop. Details: [Memory model](memory-model.md).

## Level 1: reliable play

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **Reply model and preset** | Replies in character, inside the context the server holds. | SillyTavern's own connection and preset; checked in **Connections → Setup → Host capabilities** (`so-capabilities`) | Host capabilities shows the memory model's context; Repair shows no row about a request larger than the server holds. | Your reply model's usual cost |
| **Reply thinking** | A bounded think before each reply: clean, and replies start sooner. | **Orchestrator → Defaults → Reply thinking → Thinking effort** (`so-feature-thinking-effort`), default **medium** | Repair shows no line saying characters' intentions are not tracked because the model is not thinking. | Up to 400 thinking tokens per reply at medium (low 128, high no cap); llama.cpp setups only |
| **Lore settings** | Story lore switches on only in the chats that play it. | **Connections → World → How story lorebook entries switch on** (`so-wi-gating-mode`, advanced), default **Per chat**; **Defaults → Memory-triggered lore** and **Late lore placement** stay on | Repair shows no row about entries left switched on, or a story book selected for every chat. | No model calls |
| **A fallback for the memory model** (optional) | Reads continue through an outage and switch back on their own. | **Connections → Fallback when it is down** (`so-extraction-fallback`) | During an outage the story page says another model is standing in. | Only while the memory model is down |

The extension was tested on Artemis 31B v1.1 over Text Completion with thinking on. Set the preset's context to
what the server holds (32,768 on a 24 GB card) or derive it from the backend: [What we tested on](models.md#what-we-tested-on).

## Level 2: the judge

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **Install the judge plugin** | The judge can answer at all. | `npm run plugin:install` (judge and lore plugins), `enableServerPlugins: true` in `config.yaml`, restart; status in **Connections → Judge** (`so-judge-status`) | The status line says whether the plugin answers. | None until a key is saved |
| **Save the judge key** | The judge's uses run. | **Connections → Judge → TypeSafe API key** (`so-judge-key`), then **Save key** | **Add a judge key** is done in Getting started; the status line says the judge is ready. | Small calls to TypeSafe per use; two uses run before a reply, within 1.5 s |
| **What the judge is used for** | Each use answers one kind of question, so the slower usual path runs less. | **Connections → Judge → What the judge is used for** (`so-judge-uses`); **Test the judge** (`so-judge-self-test`) | The heading counts the uses that are on; the test reports each one. | One small call per use when it runs |

Type the key yourself into SillyTavern: it is stored in SillyTavern's secrets on the server, never shown again and
never sent to the page. Every use is on by default and each says what it sends; untick one you do not want sent.
A use not measured for its provider is refused and takes its usual path. Details: [Judge](judge.md).

## Level 3: the authoring model

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **The harness plugin** | The wizard on opencode or Claude Code, with no per-token bill. | `npm run plugins:install -- --with harness`, offer the harness in its `config.json`, sign in on the server, restart; **Connections → Models per task** (`so-role-profiles`) | Each task lists the harness under **Cloud harness (on the SillyTavern server)**, without "(log in first)". | Your subscription's usage |
| **The wizard's model** | Stories built through reliable tool calls. | **Models per task → Wizard and road ahead** (`so-role-profiles`) | The select names its default as "Default: …"; Repair shows no model outage. | gpt-6.1-sol: about 25 s per Ask answer, about half an hour per wizard run, on the subscription |
| **The wizard and Ask switches** | The Studio's wizard, suggestions, Ask in Help and `/story ask`. | **Orchestrator → Help → Enable the wizard** (`so-copilot-enabled`) and **Ask questions** (`so-copilot-ask`), both on | **New story** opens the wizard; Help shows an Ask box. | A few calls per question; a wizard run while you build |

Left on its default, **Wizard and road ahead** (and Ask) uses opencode `openai/gpt-6.1-sol` when the harness plugin
offers it, else the first DeepSeek Chat Completion profile, else the memory model. DeepSeek is paid per token past
its quota, so it is the fallback. Claude Code `claude-sonnet-5-5` is the other subscription route. A roleplay
finetune is a poor wizard: it narrates instead of calling tools. A story with no briefing gets one written by this
model, one call per new story in a chat. Details: [Choosing models](models.md), [Harness](harness.md).

## Level 4: presentation

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **An image service** | Illustrations at the moments each story asks for. | SillyTavern's Image Generation source, then **Connections → Images → Image backend** (`so-image-backend`), **Test render** (`so-image-test`) | The test picture appears as its own message; **Set up an image service** is done in Getting started. | One render per picture |
| **Character sprites** | Characters on stage, faces following the reply. | A sprite pack per character (`characters/<name>/`); **Defaults → Character stage** (`so-feature-sprites-enabled`) | The stage shows in Visual Novel mode (`/vn`), or always with **Show stage** set to Always. | An expression pick per reply: the judge, else the expression model |
| **One GPU for text and pictures** | Pictures and a local text model take turns on one card. | `npm run plugin:install -- --with gpu`, a `config.json` with `"adapter": "observe"` to start, restart; status near **Connections → Images** (`so-image-settings`) | Repair no longer says pictures and the local text model share one GPU with nothing taking turns. | No model calls; replies wait while a picture renders |
| **Advanced ComfyUI recipes** (optional) | Per-purpose models, sprite edits and changed looks. | `npm run plugin:install -- --with media`, restart; **Image backend → Advanced ComfyUI recipes** (`so-image-backend`) and the ComfyUI address | **Test render** draws through ComfyUI; Setup names any model still needed. | GPU renders; a download only after you confirm its card |

Pictures are allowed on a new install and drawn only at story moments; while no service is ready they are skipped
without an error and Setup says why. The character stage starts on **Automatic**: it shows when a story directs the
stage. The GPU plugin is only for a local text model and local pictures on the same card. Details:
[Illustrations](images.md), [Sprite packs](sprites.md), [One GPU for text and images](gpu-sharing.md).

## Level 5: feature defaults

**Orchestrator → Defaults** holds one card per feature. Each switch is the default for every chat, and off there is a
master switch. A story can turn a feature off for itself, and **This story → Features** can change it for one chat.
Every feature is on by default; the character stage is on in its automatic form. Each control's id is
`so-feature-<feature>-<control>`; the main switch is `so-feature-<feature>-enabled`.

| Feature | Area | Main switch | What it does | Cost | Turn it off when |
|---|---|---|---|---|---|
| **Story reading** | Memory | `so-feature-reading-enabled` | Reads replies to track facts and story progress. | One memory model call every 3 replies. | You want to move the story by hand with `/cp` in Author view. |
| **Prompt memory** | Memory | `so-feature-memory-enabled` | Adds remembered facts to character prompts. | No call of its own: the reads already write the memories. | You are testing what a model does with nothing remembered in its prompt. |
| **Chapters and long-chat context** | Memory | `so-feature-chapters-enabled` | Records finished chapters and keeps their history in a bounded prompt. | A few memory model calls when a chapter ends, only in stories that declare chapters. | You want every old message kept in the prompt instead of a chapter record. |
| **Continuity** | Memory | `so-feature-continuity-enabled` | Restates established facts when a reply contradicts them. | One judge call after each character reply. Needs the judge. | You have no judge key, or you do not want replies sent to the judge. |
| **Player agency** | Story direction | `so-feature-agency-enabled` | Reminds replies to leave your actions and decisions to you. | Shares the continuity check's judge call. | The story is one where characters may act and speak for you. |
| **Tension and pacing** | Story direction | `so-feature-pacing-enabled` | Guides replies toward the story's tension curve. | No model call: one short note in the prompt. | You want replies without a nudge toward the story's tension. |
| **Reply thinking** | Story direction | `so-feature-thinking-enabled` | Sets the thinking budget for future character replies on a supported local backend. | Up to 400 thinking tokens per reply at Medium. Only llama.cpp setups that think. | Your model does not think, or you want the fastest replies. Off sends a budget of 1. |
| **Living continuation** | Story direction | `so-feature-living-enabled` | Writes the next turning point from a living premise. | Authoring model calls when play reaches the last written turning point of a living story. | You want a living story to stop at its last written turning point. |
| **Adaptive branches** | Story direction | `so-feature-branching-enabled` | Prepares a way forward when your choices leave the planned routes. | Authoring model calls when you go off script; at most one branch per turning point. | You want the story to keep to its written routes. |
| **Prepare a route ahead** | Story direction | `so-feature-prefetch-enabled` | Prepares one adaptive route before it is needed. Requires adaptive branches. | One authoring model call in the background per turning point with ways forward. Needs branching. | Your authoring model is paid per token and you rarely go off script. |
| **Speaker direction** | Characters | `so-feature-speakers-enabled` | Chooses who should answer in a group scene. | A short pick before replies when a scene directs who speaks: the judge, else the speaker-direction model. | You prefer SillyTavern's own turn order. |
| **Several voices per turn** | Characters | `so-feature-voices-enabled` | Allows several characters to answer before returning to you. | Each extra voice is another reply from your reply model, up to 3 by default. | You want one character to answer at a time. |
| **Private inner voice** | Characters | `so-feature-inner-enabled` | Prepares private intent for the next speaker and reads reply reasoning. | Up to two memory model calls per turn, never while you wait for a reply. | Your memory model is slow or paid per token. |
| **Promises remembered** | Characters | `so-feature-promises-enabled` | Remembers promises you make to a character in your own words, and reminds only that character when it matters. | A few extra lines in each story read. | You do not want promises tracked. |
| **Who heard what** | Characters | `so-feature-witness-enabled` | Each story read also notes which characters heard each message; nothing uses it until it is measured. | A few extra lines in each story read. Nothing uses the record until it is measured. | You want the shortest possible reads. |
| **Rumors and gossip** | Characters | `so-feature-rumors-enabled` | Passes a story's rumors between characters along its channels, as hearsay the receiver may doubt. | No model call. Only stories that declare rumors use it. | You want news to reach characters only on stage. |
| **Off-stage events** | Characters | `so-feature-meanwhile-enabled` | Proposes events toward the plans a story gives its characters. | One memory model call when the story moves on or a scene ends, for stories whose characters have plans. | You want characters to act only on stage. |
| **Current character state** | Characters | `so-feature-cardState-enabled` | Adds public character changes to replies without editing character cards. | No model call: public changes join the next reply's prompt. | You want character cards read exactly as written. |
| **Lorebook curator** | World and lore | `so-feature-curator-enabled` | Proposes changes only to the lorebooks this story permits. New entries always need review. | Curator model calls in the background. Changes wait for you by default. | You never want a lorebook changed during play. |
| **Memory-triggered lore** | World and lore | `so-feature-memoryLore-enabled` | Lets public memories activate lorebook entries. Private knowledge stays private. | No model call. | Lore fires on words from memory that you do not want it to. |
| **Late lore placement** | World and lore | `so-feature-lateLore-enabled` | Places changing story lore near recent messages to preserve prompt-cache reuse. | No model call. The start of the prompt stays the same, so a local model can reuse it. | Your lore must sit beside the character card, as written. |
| **Illustrations** | Visuals | `so-feature-illustrations-enabled` | Draws story moments after the text has finished. | One render per picture on your image service. | You have no image service, or the GPU is busy with other work. |
| **Character stage** | Visuals | `so-feature-sprites-enabled` | Shows the speaking characters and their expressions. | An expression pick per reply: the judge, else the expression model. | You never want the stage, even in stories that direct one. |
| **Character poses** | Visuals | `so-feature-poses-enabled` | Uses the story's body-pose library on the character stage. | Body renders on ComfyUI when a pose is needed. | You have no ComfyUI pose setup. |

The judge checks behind a feature (for example lore selection behind memory-triggered lore) are listed on that
feature's page and switched in **Connections → Judge**.

## Level 6: author-side

| Step | What it unlocks | Where | How to check | Cost |
|---|---|---|---|---|
| **Author view** | Tracked values, the scheduler, the prompt preview, review cards and `/cp`, for one chat. | **This story → Author → Show author view** (`so-author-view`), then confirm | Blackboard, Scheduler and Payload tabs appear for this chat only. | None |
| **A story's own feature choices** | Each story runs with the features it was written for. | **Library → Author → Studio** (`so-open-studio`), the story's feature policies ([Story feature policies](../author/fields/story.md#feature-policies)) | **This story → Features** says "Turned off by this story" on a declined feature. | None |
| **One chat's preferences** | A setting tried in one chat without touching the install or the story. | **This story → Features**, any feature card (`so-feature-<feature>-<control>`) | The source chip says **This chat**; **Reset to story/default** puts it back. | Whatever the feature costs |
| **Review proposals** | Lorebook changes and continuity notes you accept, applied at the end of the next reply. | **This story → Review**, in Author view | An accepted change applies at the end of the next reply; a rollback reverts it. | None beyond the curator's own calls |

Author view spoils the story it is turned on in, so it asks first. A feature that is off on the install cannot be
turned on for one chat: turn it on in **Defaults** first. New lorebook entries always wait for review, whatever the
curator setting. Next: [Writing a story](../author/README.md).

---

[Setup](README.md)
