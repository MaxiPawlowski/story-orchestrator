# Starting, continuing and restarting

## Pick a story for a chat

A story plays in one group chat at a time, a group with the story's characters. Stories play in group chats only: in
a one-on-one chat the story stays off and the panel offers **Make a group for this story**.

1. Open the group chat (a story needs an open group chat; with no chat open, an imported story is only saved to the
   library: "Open a chat to play it."; in a one-on-one chat it is saved and the panel offers to make a group).
2. Open **Extensions → Story Orchestrator**. The panel starts with four tasks:
   - **Start**: **New story (wizard)** builds one from a premise; **Import a story** takes a story file (JSON).
   - **Continue**: says what this chat plays ("No story is playing in this chat yet." or `Playing "<title>".`).
     **Choose a story** picks one from your library.
   - **Repair**: the one thing still missing, if any, with **Show me the setting** or **Show me the group**.
   - **Author**: Author view and the Studio, for writing stories.
3. Write your first message. The story follows from there.

If the story needs characters, a lorebook or a persona this chat does not have, the drawer lists them under
**This story still needs** and Repair names the first one.

## The story briefing

The first time a story starts in a group chat, a **Before you start** page opens over the chat: the author's
briefing (the world, who you are, who is with you, how to play), and on your first story ever a short
**How Story Orchestrator works** section about the status strip, the notes under messages and the drawer. The
opening scene still posts behind it; close it with the button at the bottom (**Begin**, or the author's own word).

Each chat shows it once, and remembers that across reloads, swipes and edits. **Restart story** shows it again. Re-open
it any time with **Story briefing** at the bottom of the drawer's Overview, or `/story intro`. To stop it opening on
its own, untick **Show the story briefing when a story starts** under **Display**, or tick **Don't show briefings**
on the page itself. A story without a briefing shows its introduction instead, if it has one.

## Your character

A story can say who you play in it: a role, a few lines about you and what the story takes for granted. Then the
start page also shows **Who you are in this story**, and you choose once:

- **Play as** your current persona (what closing the page does too);
- **Choose another persona** from the ones you have;
- **Create a persona for this story**: the name and description are shown in full and you can edit them first.
  It is only ever added; your other personas are never changed.

Whatever you choose, the chat keeps that persona for the whole story (SillyTavern's own chat lock), and the opening
scene waits for your choice. The story also tells the characters, in one line, who you are in it. If you switch
persona in the middle of the story, the drawer says so with **Switch back**: characters know you as the person you
started as. To play someone else, **Restart story** and choose again. A story that fixes your name waits until a
persona with that name is chosen.

**Your character in this story** at the bottom of the drawer's Overview, or `/story who`, shows it again. To skip the
question and always keep your current persona, untick **Ask who you are when a story starts** under **Display**.

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

## Talking out of character

To say something outside the story, wrap the whole message in double brackets, `((brb, dinner))`, or start it with
`OOC:` or `(OOC`. The characters still see it, but the story does not read it: it changes nothing in the story,
counts as no turn, is never remembered and is not listed in the story panel's log. Brackets inside an ordinary line, "I say (quietly) hello", are read as
usual. To correct the story, edit the message instead.

## Stuck? "What could I do?"

The lightbulb button in the story drawer (and **What could I do?** in the wand menu) asks the memory model for four
things you could try next. It sees only what you have already seen: the scenes you reached, the drawer's Overview
and the recent messages, never the story's later scenes or anything a character keeps from you. Pick one and it is
put in the box where you type; nothing is sent until you send it, and it never replaces something you started
typing. **Other ideas** asks again. It calls the model only when you open it. A story can switch the button off, and
so can you under Display.

## Branches

A branch made from a chat that plays a story does not pick the story up on its own. The story bar shows
`branch — continue?`; click it, then **Continue from here** to carry on from where the branch ends.

## Finding your story chats

Groups and chats that play a story carry a small icon in SillyTavern's lists: the group list, the welcome
screen's recent chats and a group's past chats. A saga, a story its author marks as one (a whole campaign rather than one of its acts), has its own icon.
Hover or focus the icon for a card with the story, its chapter, where you are and when you last played.

**Your stories**, under Continue in the extension's settings, lists every chat that plays a story, newest
first; **Open** takes you straight to it. The list fills in as you open chats, and once in the background after
an update. A chat keeps its row while it still plays its story, even after the story leaves your library.

Each of these can be switched off under Display, and a story can switch its own off; a story can never turn one
on that you switched off.

## Journal, stat sheet and story panels

A story with side quests gives you a **Journal**: the quests you have found, their steps and progress, what a
quest gives you when the story shows it, the main line so far, milestones you have earned, and a short log. A quest
you have not found yet is not listed at all. A story that shows some of your stats gives you a **Stat sheet**, and a
story can add its own panels (a clock filling up, a quest board). Open them from the buttons under the drawer's
Overview or from the wand menu; each opens in its own panel you can move and resize. **Journal**, **Stat sheet** and
**Story panels** in the settings turn each off, and the author can switch them off for one story.

A swipe or an edit of the reply that finished a quest takes the quest, and whatever it gave you, back with it.

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
| `/story intro` | Opens the story briefing again. |
| `/story who` | Who you play in this story. |
| `/story quests` | The quests you have found and where each stands. |
| `/story flag [note]` | Marks this moment for the author to look at. |
| `/story guide [page]` | Opens this guide inside SillyTavern, at a page such as `player/memory`. |

`/so-mem list`, `/so-mem pin <n> on|off` and `/so-mem exclude <n>` manage memories from the chat box (see
[Memory](memory.md)). `/cp` is an author tool and works only in Author view.

---

[Playing a story](README.md)
