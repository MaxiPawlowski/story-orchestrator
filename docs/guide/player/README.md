# Playing a story

Story Orchestrator turns a SillyTavern chat into a story with a shape: scenes that open in order, characters who
come and go, and a memory of what happened. You play as you always do, by writing messages. The extension follows
along, keeps track, and nudges the characters toward the next scene.

You do not need to learn anything to play. These pages explain what you see on screen.

- [Starting, continuing and restarting](playing.md): picking a story for a chat, restarting, library updates,
  branches, the welcome-back recap and the `/story` command.
- [The story bar, the drawer and the notes under messages](drawer-and-hud.md): what each part of the screen
  tells you.
- [Memory](memory.md): what the story remembers, and how to pin, edit or remove a memory.
- [Troubleshooting and FAQ](troubleshooting.md): when the story does not move, or something looks wrong.

Setting up the extension for the first time is in [Setup](../setup/README.md). Writing your own stories is in the
[Author's guide](../author/README.md).

## Player mode and Author view

The drawer opens in **player mode**. It shows only what a player should see: where you are, what happened, what is
still open. Nothing in it spoils the story.

**Author view** is for the person who wrote or is testing the story. It *adds* the machinery (tracked facts,
scheduler, prompt contents, steering controls) and spoils the story, so it asks before it turns on. It is per chat.
If you only want to play, leave it off.
