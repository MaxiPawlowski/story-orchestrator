# Story Orchestrator

A SillyTavern extension that plays **authored stories** over a group chat. A story is a map of scenes (`checkpoint` in
the story file) with ways forward that open on what the chat actually shows. A second model reads the chat every few
replies, off the reply path, keeps the story's facts and memory, and the extension steers the cast, the lore and the
pacing toward the next scene. Swipes, edits and deletions roll the story back with the chat. You play by chatting, as
always.

**Guide website:** [maxipawlowski.github.io/story-orchestrator](https://maxipawlowski.github.io/story-orchestrator/) (the same pages ship inside the extension: `/story guide`).

## What it does

- **Plays a story over your chat**: scenes open in order when the chat shows what they wait for; one scene change per
  reply, never a forced one.
- **Remembers**: facts, scene history and chapter summaries go back into the prompt, and each character knows only what
  they saw or were told.
- **Directs a group**: picks who speaks next, lets several characters answer one message, and switches each scene's
  lore on in the chats that play the story only.
- **Stays out of your way**: a one-line story bar, small notes under messages, and a story window with no spoilers
  unless you turn on Author view.
- **Helps you write**: a wizard that builds a story from a premise, and the Studio to refine it.
- **Optional extras**: a fast judge model, illustrations and character sprites, and running tasks on a Claude, ChatGPT or
  opencode subscription.

Every feature with its status: [Feature catalog](#feature-catalog).

## What you need

- SillyTavern 1.19.0 (the tested version), with a model connected for replies.
- A **memory model**: a Connection Manager profile the story uses to read the chat. Your reply model works to start.
- Node.js 22 and Git, to build the extension (there is no published release yet).
- Stories play in **group chats**; a group of one character is fine.

## Install

The step-by-step procedure, with PowerShell and Bash commands and how to tell it worked:
[Install](https://maxipawlowski.github.io/story-orchestrator/setup/index.html#so-guide-h-install)
([source](docs/guide/setup/README.md#install)). In short: clone this repository outside SillyTavern, write your
SillyTavern folder into `.st-root`, then `npm ci`, `npm run build`, `npm run stage`, and reload SillyTavern.
**Extensions → Story Orchestrator → Open Story Orchestrator** appears.

## First play

The [Quick start](https://maxipawlowski.github.io/story-orchestrator/quick-start.html) takes you from install to playing
the bundled example story in a group chat: choose a memory model in **Orchestrator → Connections**, import the example's
cast and lore, import the story in **Orchestrator → Library**, and write your first message.

| Tested on | |
|---|---|
| SillyTavern (live play) | 1.19.0 |
| Declared older host | 1.18.0 (`minimum_client_version`): machine gates only, not played through |

Other versions are untested; details in
[Tested on](https://maxipawlowski.github.io/story-orchestrator/setup/index.html#so-guide-h-tested-on).

## Optional services

### Companion server plugins

Their source, tests and READMEs live in [`server-plugin/`](server-plugin/). They run inside SillyTavern's Node server; the browser extension calls their
`/api/plugins/story-orchestrator-*` routes.

| Plugin | Provides |
|---|---|
| [Judge](server-plugin/story-orchestrator-judge/README.md) | Server-side judgment-provider requests and credentials. |
| [Lore](server-plugin/story-orchestrator-lore/README.md) | Conditional lorebook saves: a write lands only while the file still holds what it started from. |
| [Harness](server-plugin/story-orchestrator-harness/README.md) | Model tasks through coding-agent CLIs and the wizard's opencode tool bridge. |
| [GPU](server-plugin/story-orchestrator-gpu/README.md) | Coordination of local text generation and ComfyUI sharing a GPU. |
| [Media](server-plugin/story-orchestrator-media/README.md) | Owned ComfyUI jobs, reference edits, model fingerprints and generated sprite files. |

All five are optional. `npm run plugin:install` installs judge and lore (add `-- --with gpu,media,harness` for the others),
set `enableServerPlugins: true` in SillyTavern's `config.yaml` and restart SillyTavern:
[Server plugins](https://maxipawlowski.github.io/story-orchestrator/setup/index.html#so-guide-h-server-plugins).

### Illustrations and scope

Images are optional. By default they use whatever image source SillyTavern's own Image Generation extension has set up
(**Orchestrator → Connections → Images → Image service**); an image-prompt profile is optional, and a template works
without one. With no image service nothing is drawn and nothing fails. Install defaults decide whether automation is
allowed; a story can ask for art at its own moments; each chat can change it on **This story → Features →
Illustrations**. The advanced ComfyUI recipes need the optional media plugin and pick a model per picture type from
what your ComfyUI has. The GPU plugin is optional; configure its adapter when local text and image models need to
share one GPU. [More](https://maxipawlowski.github.io/story-orchestrator/setup/images.html)

### Judge

The judge (TypeSafe's Jev, behind the optional `story-orchestrator-judge` server plugin) ships with **every use on**,
and sends nothing until a TypeSafe key is configured. Each use lists what it sends in its tooltip. Measured on
`jev-1.13.0`; on another model the panel marks a use as unproven. The use table, privacy and measurements:
[Judge](https://maxipawlowski.github.io/story-orchestrator/setup/judge.html).

## Macros and commands

`{{story_*}}` macros (title, checkpoint, tension, scene location/time/present, `story_quality_<key>`, memory tiers,
chapters, …), `/story`, `/so-mem` and the author's `/cp`:
[Macros and slash commands](https://maxipawlowski.github.io/story-orchestrator/author/macros-and-commands.html).

## Support and development

Something wrong? **Orchestrator → Help → Setup → Host capabilities → Copy for a bug report** copies what a report needs;
[Troubleshooting](https://maxipawlowski.github.io/story-orchestrator/player/troubleshooting.html) covers the common
cases. The guide's sources are in [`docs/guide`](docs/guide/README.md); developer docs are in
[`docs/dev`](docs/dev/contributing.md).

## Provenance & licensing

Story Orchestrator is **AGPL-3.0** (see [`LICENSE`](LICENSE)); distributing it requires making source available
under the same terms.

- The memory subsystem is a vendored TypeScript adaptation of
  [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0).
- The copilot's proposal/diff-review pattern comes from [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT).
- The state-memo and delta-log/rollback patterns come from
  [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT).
- The extraction stability lag and manual memory controls follow
  [SillyTavern-MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize) (AGPL-3.0 — patterns only,
  no code vendored).

## Feature catalog

Generated from the feature registry. "Experimental" means not yet measured; it is still on by default.

<!-- features:start (generated by npm run docs:settings; edit src/features/registry.ts) -->
| Area | Feature | In one line | Status |
|---|---|---|---|
| Playing | Stories | Play an authored story on top of an ordinary chat. |  |
| Playing | Group story | A group can start every new chat with the same story. |  |
| Playing | Story briefing | A short "Before you start" page the first time a story starts in a chat. |  |
| Playing | Drafted briefing | A story with no briefing gets one written for this chat from its opening. |  |
| Playing | Who you are in this story | A story that says who you play asks you once, at the start: keep your persona, choose another, or create one. |  |
| Playing | Carry a finished story | A sequel, or a replay of the same story, can start from how a run you finished ended. | Experimental |
| Playing | Story drawer | Where you are, what happened, and what you are remembered for. |  |
| Playing | Status strip | One line above the chat input: where the story is and how tense it is. |  |
| Playing | Your move | A chip in the status strip when the characters hand the turn back to you. |  |
| Playing | Notes under messages | Small icons under replies: where the story moved, what it remembered, which lore it used. |  |
| Playing | Chat note when the story moves on | Optionally post a short chat note at each new turning point. | Off by default |
| Playing | Recap and welcome back | Coming back after a break shows where you left off; /story recap asks any time. |  |
| Playing | Branched chats | A chat branched from a story keeps going from where the branch ends. |  |
| Playing | Tension and pacing | Measures the scene's tension and nudges replies toward the story's intended shape. |  |
| Playing | Story marks in the lists | Groups and chats that play a story carry a small icon in SillyTavern's lists. |  |
| Playing | Story card | Hover a group's story icon to see the story, its chapter and when you last played. |  |
| Playing | Your stories | Under Continue: every chat that plays a story, newest first, one click to open it. |  |
| Playing | Chapter title cards | A full-width card under the message where a new chapter opens. |  |
| Playing | Story in the wand menu | Story recap, the story briefing, flag this moment and the story window, from the extensions wand. |  |
| Playing | Dice chips | A check the story makes public shows its roll under the message it decided. |  |
| Playing | Activity panel | A movable panel listing what the machine did behind each recent message. |  |
| Playing | What could I do? | A button that suggests a few things you could try next, and puts the one you pick in the box where you type. |  |
| Playing | Repetition readout | Author view names phrases the latest reply repeats from the five before it. | Experimental |
| Playing | Journal | A movable panel with your quests and a log of what happened, for stories that keep quests. |  |
| Playing | Stat sheet | A movable panel with what you carry and the meters the story shows in the open. |  |
| Playing | Story panels | Extra panels a story adds, such as a clock that fills, a board of quests, a wall of clues or a map. |  |
| Playing | Story-made panels | A panel page a story brings, run shut off from SillyTavern. |  |
| Playing | People and Places | Journal pages that fill in with the people and places you have learned about. |  |
| Playing | Things you notice | Small details the story lets you notice, on the story card when they land and in the Journal after. |  |
| Playing | Here now | A small card a story can place: where you are, when, and who you have met is with you. |  |
| Playing | The narrator sees your sheet | What your stat sheet shows also reaches the narrator, so it does not deny an item you carry. |  |
| Playing | Save this run as a story | Keep a living story's run as a story you can play again or edit. | Experimental |
| Playing | What changed | Up to five lines on what changed this chapter: on the chapter card, in the Overview and in /story recap. | Experimental |
| Playing | Story patterns | When events the story wrote a pattern for happen in order, its callback line joins What changed. | Experimental |
| Memory | Story memory | Remembers what happened so characters stay consistent. |  |
| Memory | Memory tab | See, search, pin or remove what the story remembers. |  |
| Memory | Chapters | Long stories write up each finished chapter and recap it when you return. |  |
| Memory | Continuity warden | Catches a reply that breaks an established fact and restates the fact for the next reply. |  |
| Memory | Memory model test | Runs fixed scenes through the memory model and reports what it can do. |  |
| Memory | Reply thinking | Limits how long the chat model thinks before each reply. |  |
| Memory | Models per task | Send each kind of background work to its own model. |  |
| Memory | Threads you put off | A topic you put off in your own words stops being pushed until you bring it up again. |  |
| Memory | Who heard what | After each story read, notes in code which characters heard each message. |  |
| Characters | Speaker direction | In a group, the story picks who should speak next. |  |
| Characters | Several voices per turn | More than one character can answer one of your messages. |  |
| Characters | One question when a character asks you | A character told to ask you one thing keeps only the last of its questions. |  |
| Characters | Private knowledge | Tracks who knows what, so characters do not know things they never saw. |  |
| Characters | Inner voice | Characters prepare a private intent before they speak. |  |
| Characters | Character life | Feelings that move, a mood per scene, plans that go on off stage and places to be, for the characters a story declares. | Experimental |
| Characters | Story time | A time of day, a day count and an optional calendar, moved by the story, never by the wall clock. | Experimental |
| Characters | Standing with groups | How the groups in a story regard you, shown as a word such as "Wary" or "Trusted". | Experimental |
| Characters | Relationship labels | Words for how a character treats you, and secrets about them you can learn, on their People page. | Experimental |
| Characters | Promises to you | Things a character has promised you, which the character remembers and may keep, raise or break. | Experimental |
| Characters | Reactive cues | Characters notice what a story says they would, deepen a topic you ask them about again, and react when a social rule is broken. | Experimental |
| Characters | Delayed echoes | Something that happened comes back later: after a delay, if the story still fits, one character or the narrator is handed a cue about it. | Experimental |
| Characters | Promises remembered | A promise you make to a character is remembered in your own words. |  |
| Characters | Voice and delivery | Each character is told privately how they word things. |  |
| Characters | Reply polish | Checks what a reply would read like with a character's off-voice words removed, without changing the chat. | Experimental |
| Characters | Rumors and gossip | News a story declares travels between characters along the channels it authors, and may change on the way. |  |
| World | Story lorebook switching | Story lorebook entries switch on and off as the story moves. |  |
| World | Story lorebooks | A story's lorebooks load only in the chats that play it. |  |
| World | Memory can trigger lore | Established facts and scene history can activate lorebook entries. |  |
| World | Per-turn lore after the history | Lore that changes every turn is placed near the end of the prompt, so the start can be reused. |  |
| World | Lorebook curator | Proposes updates to the story's lorebook as play overtakes it. |  |
| World | New lorebook entries | The curator proposes a new keyed entry for something play has established. |  |
| World | Protected and auto lore | Markers in a lorebook entry keep words safe from the curator, or let its changes apply on their own. |  |
| World | Story scenario | A turning point can set the chat's scenario text, in place of every character card's own. |  |
| World | Off-stage events | Adds what a character did off stage toward their plan; it applies on its own by default. | Experimental |
| World | Living stories | A story that writes its next turning point ahead of you, from what you actually pursued. | Experimental |
| World | Branches that follow you | When you leave the prepared ways forward, the story writes a branch that follows you and later comes back. | Experimental |
| World | Scene test | Before the living director writes a turning point, a seeded draw may tell it the scene arrives changed or that the world acts first. | Experimental |
| Images | Live close-shot head | A rigged close shot breathes, blinks, sways, gestures and talks as a reply streams. | Experimental |
| Images | Prepared cast presentation | Review and accept each character's base and bust before sprites, poses and live heads use them. | Experimental |
| Images | Reference views | Draw an accepted character three-quarter left and right, in profile and from behind, then accept or cancel all six views. | Experimental |
| Images | Changed-look bust and rig | Rebuild a changed look's bust and live-head rig, then accept or cancel. | Experimental |
| Images | Face landmark cross-check | A local face detector double-checks the vision model's eyes, mouth and jaw before you accept a rebuilt rig. | Experimental |
| Images | Prepared cast illustration | Draw one or two prepared characters together in their current looks. | Experimental |
| Images | Poses and character layers | Direct a body pose and let looks change with the story. |  |
| Images | Backgrounds | A turning point can switch the chat background. |  |
| Images | Illustrations | Draws scenes and characters through your image service. |  |
| Images | One GPU for text and images | A local text model and local pictures share one graphics card. | Off by default |
| Images | Story image workflows | A story picks which of your ComfyUI workflows draws each kind of picture. |  |
| Images | Downloading models | Download a model from Civitai or Hugging Face into your model folders, verified. | Experimental |
| Images | Sprite stage | Character sprites that change expression as replies stream. |  |
| Images | Animated faces | Blink and talking-mouth frames give sprites movement. | Experimental |
| Judge | Judge | A second, fast model for yes/no and pick-one decisions. |  |
| Judge | Local judge | An open model on this machine that can answer the judge's questions instead of TypeSafe. | Experimental |
| Authoring | Build sprite packs | Edit a reference picture into expression sprites and animation frames. | Experimental |
| Authoring | Mouth replacement region | Replace the lips cleanly while leaving the rest of the expression intact. | Experimental |
| Authoring | Sprite edit resolution | Compare smaller edits for faster sprite generation. | Experimental |
| Authoring | Prepared road ahead | Writes the scenes between two turning points before play gets there. |  |
| Authoring | Studio | Edit a story: its cast, turning points, goals and effects. |  |
| Authoring | Story wizard | Builds a story from a premise and creates the cards, lore and group it needs. |  |
| Authoring | Build a character | One character a step at a time: who, look, voice, greeting, examples, review. |  |
| Authoring | Author view | Shows the story's internals for this chat: goals, state and what characters hide. |  |
| Authoring | Story diagnostics | Says what each problem in a story costs it, before the technical detail. |  |
| Authoring | Open stretches | Free play between two turning points, with no task. | Experimental |
| Authoring | Quests, checks and panels | Side quests, visible stats, dice checks and milestones a story declares. | Experimental |
| Setup | Carried thought | When no private intent is ready, a character keeps the aim from its own last thought. | Experimental |
| Setup | Repair | Names the one thing missing and takes you to the setting that fixes it. |  |
| Setup | Getting started | A short checklist: memory model first, then the optional judge and images. |  |
| Setup | Help | This list: every feature, whether it is on in this chat and who chose that, and where to find it. |  |
| Setup | Ask | Ask about Story Orchestrator, SillyTavern or your story. It only reads. |  |
| Setup | Host capabilities | Checks that SillyTavern has everything the extension needs, and copies a bug report. |  |
| Setup | Experiments | Unmeasured trials. | Experimental |
| Setup | Guide | The whole guide inside SillyTavern: playing, setup and writing stories. |  |
| Setup | Tour | Short tours that point at the real controls: playing, writing stories, and setting up. |  |
<!-- features:end -->
