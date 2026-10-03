# Starting, continuing and restarting

## Pick a story for a chat

A story plays in one chat at a time, usually a group chat with the story's characters.

1. Open the chat (a story needs an open chat; with none open, an imported story is only saved to the library:
   "Open a chat to play it.").
2. Open **Extensions → Story Orchestrator**. The panel starts with four tasks:
   - **Start**: **New story (wizard)** builds one from a premise; **Import a story** takes a story file (JSON).
   - **Continue**: says what this chat plays ("No story is playing in this chat yet." or `Playing "<title>".`).
     **Choose a story** picks one from your library.
   - **Repair**: the one thing still missing, if any, with **Show me the setting** or **Show me the group**.
   - **Author**: Author view and the Studio, for writing stories.
3. Write your first message. The story follows from there.

If the story needs characters, a lorebook or a persona this chat does not have, the drawer lists them under
**This story still needs** and Repair names the first one.

## Each chat keeps its own copy

A chat keeps the exact version of the story it started with. Editing or deleting the story in the library never
changes a game in progress. When a newer version exists, Author view shows **Update to v*N*** in the drawer. A
small update is applied in place; a bigger one asks whether to **Keep playing**, **Restart story** or **Cancel**.

## Restart

**Restart story** (bottom of the drawer's Overview) starts the story over in this chat. Your messages stay; the
story's progress and its memory are cleared. It asks first.

## Swipes, edits and deletions

Change the chat however you like. When you swipe a reply, edit a message or delete one, the story steps back to
match, and the drawer says so ("The story stepped back to … to match your edit."). It moves forward again on the
next reply.

If an edit reaches back further than the chat can rewind, the story stays where it is and offers **Re-read from the
current scene** or **Restart story**.

## Branches

A branch made from a chat that plays a story does not pick the story up on its own. The story bar shows
`branch — continue?`; click it, then **Continue from here** to carry on from where the branch ends.

## Finding your story chats

Groups and chats that play a story carry a small icon in SillyTavern's lists: the group list, the welcome
screen's recent chats and a group's past chats. A saga, a story with two or more chapters, has its own icon.
Hover or focus the icon for a card with the story, its chapter, where you are and when you last played.

**Your stories**, under Continue in the extension's settings, lists every chat that plays a story, newest
first; **Open** takes you straight to it. The list fills in as you open chats, and once in the background after
an update. A chat keeps its row while it still plays its story, even after the story leaves your library.

Each of these can be switched off under Display, and a story can switch its own off; a story can never turn one
on that you switched off.

## Coming back after a break

After eight hours or more away, opening the chat shows a **Welcome back** recap: where you are, what happened
recently and what is still open.

## The /story command

Type these in the chat box. None of them spoil anything.

| Command | What it does |
|---|---|
| `/story recap` | Where the story is right now (the same as the drawer's Overview). |
| `/story threads` | What is still open. |
| `/story chapters` | The chapters that have ended, if the story uses chapters. |
| `/story chapter <n>` | One ended chapter's summary. |
| `/story chronicle export` | Copies the whole chronicle as Markdown. |
| `/story flag [note]` | Marks this moment for the author to look at. |

`/so-mem list`, `/so-mem pin <n> on|off` and `/so-mem exclude <n>` manage memories from the chat box (see
[Memory](memory.md)). `/cp` is an author tool and works only in Author view.

---

[Playing a story](README.md)
