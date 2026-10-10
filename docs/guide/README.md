# Story Orchestrator guide

Story Orchestrator is a SillyTavern extension that plays authored stories over a chat: scenes that open in order,
characters who come and go, lore that switches on when it matters, and a memory of what happened. You play by
chatting, as always.

**Stories play in group chats.** Each character keeps their own voice and what they know, so a story needs a group
with its cast, even a one-character story (that character plus a narrator).

**New here? Start with the [Quick start](quick-start.md)**: install, choose a memory model, and play the bundled
example story.

## The guide

### Play

What you see on screen while a story plays, and what to do when it stalls.

- [Playing a story](player/README.md): player mode, Author view, and where each part of the guide is.
- [Starting, continuing and restarting](player/playing.md): picking a story for a chat, branches, the recap, `/story`.
- [The story bar, the drawer and the notes under messages](player/drawer-and-hud.md): what each part of the screen tells you.
- [Memory](player/memory.md): what the story remembers, and how to pin, edit or remove a memory.
- [Troubleshooting and FAQ](player/troubleshooting.md): when the story does not move, or something looks wrong.

### Set up

The one required setting, the optional judge, images and server plugins.

- [Setup and install](setup/README.md): what is required, what is optional, and the settings panel.
- [Memory model](setup/memory-model.md): the one required setting, the model that reads the chat after each reply.
- [Choosing models](setup/models.md): which model for which job, and where to set each.
- [Judge](setup/judge.md): the optional small model that picks speakers, lore and scene details.
- [Illustrations](setup/images.md): image services for story illustrations.
- [Sprite packs and changed looks](setup/sprites.md): character sprites on the stage, and looks that change.
- [One GPU for text and images](setup/gpu-sharing.md): a local text model and local images on one graphics card.
- [Harness](setup/harness.md): running tasks through a Claude Code, Codex or opencode login on the server.
- [Settings reference](setup/settings-reference.md): every setting, section by section, with its default.

### Write stories

Build a story with the wizard or by hand, then refine it in the Studio.

- [Author's guide](author/README.md)
- [Build a story step by step](author/step-by-step.md)

### Develop

Work on the extension itself.

- [Contributing](../dev/contributing.md)
- [Architecture](../dev/architecture.md)

This guide also ships inside the extension: **Help → Open the guide**, or `/story guide`. Author pages show there
only in Author view.
