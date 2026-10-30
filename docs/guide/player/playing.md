# Starting, continuing and restarting

## Pick a story for a chat

1. Open a **group chat** with the story's characters. Stories play only in group chats; a group of one character is
   fine. In a one-on-one chat the story stays off and **Settings → Library** offers **Make a group for this
   story**. With no chat open, an imported story is only saved to the library.
2. Open **Extensions → Story Orchestrator → Open Story Orchestrator**. It opens at **Settings → Library**, which
   starts with four tasks:
   - **Start**: **New story (wizard)** builds one from a premise; **Import a story** takes a story file (JSON);
     **Start from a premise** begins a living story that writes its next scene as you play.
   - **Continue**: says what this chat plays. **Choose a story** picks one from your library; **Restart or export**
     goes to the restart controls. **Your stories** lists every chat that plays a story.
   - **Repair**: the one thing still missing, if any, with a **Show me** button.
   - **Author**: Author view and the Studio, for writing stories.
3. Write your first message. The story follows from there. **This chat → Play** (or the route icon in the top bar)
   shows where you are.

If the story needs characters, a lorebook or a persona this chat does not have, **This chat → Play** lists them under
**This story still needs** and Repair names the first one.

### Every new chat in a group

Under **Settings → Library**, **New chats in <group> start with** picks a story for the group: each new, empty
chat in that group starts playing it. Chats already playing keep their own story. Choose **No story (choose in each
chat)** to clear it. This is separate from the story the open chat plays.

## The story briefing

The first time a story starts in a group chat, a **Before you start** page opens over the chat: the author's
briefing (the world, who you are, who is with you, how to play), and on your first story ever a short
**How Story Orchestrator works** section about the status strip, the notes under messages and the story window. The
opening scene still posts behind it; close it with the button at the bottom (**Begin**, or the author's own word).

Each chat shows it once, and remembers that across reloads, swipes and edits. **Restart story** shows it again. Re-open
it any time with **Story briefing** on **This chat → Play**, or `/story intro`. To stop it opening on its own, untick
**Show the story briefing when a story starts** in **Settings → Display**, or tick **Don't open briefings automatically** on
the page itself. A story without a briefing shows its introduction instead, if it has one, and the wizard's model
writes a briefing for this chat from the story's opening (who you play, where you start, who is with you). It arrives on
the open page a few seconds later, marked as written for this chat; the opening scene never waits for it, and a draft
that would give anything away is thrown out. Untick **Write a briefing when a story has none** to keep the
introduction.

## Your character

A story can say who you play in it: a role, a few lines about you and what the story takes for granted. Then the
start page also shows **Who you are in this story**, and you choose once:

- **Play as** your current persona (what closing the page does too);
- **Choose another persona** from the ones you have;
- **Create a persona for this story**: the name and description are shown in full and you can edit them first.
  It is only ever added; your other personas are never changed.

Whatever you choose, the chat keeps that persona for the whole story (SillyTavern's own chat lock), and the opening
scene waits for your choice. The story also tells the characters, in one line, who you are in it. If you switch
persona in the middle of the story, **This chat → Play** says so with **Switch back**: characters know you as the
person you started as. To play someone else, **Restart story** and choose again. A story that fixes your name waits
until a persona with that name is chosen.

`/story who` shows it again. To skip the question and always keep your current persona, untick **Ask who you are when
a story starts** in **Settings → Display**.

## Who answers in a group

In a group chat the story picks who speaks next: the character the scene calls for, rather than everyone in turn. More
than one character can answer one of your messages (three at most by default); the story picks each next speaker and
stops when it is your turn again, and a voice that is about to start gives way when you send something.

Both are on by default. **This chat → Settings → Speaker direction** and **Several voices per turn** change them for
this chat (for example, back to SillyTavern's own turn order); **Settings → Features** changes them for every chat.
A busier scene means more replies per message, so a longer wait and more calls.

## Each chat keeps its own copy

A chat keeps the exact copy of the story it started with. Editing or deleting the story in the library never
changes a game in progress. When the library's copy differs, Author view shows **Update to the latest** on
**This chat → Author**. A small update is applied in place; a bigger one asks whether to **Keep playing**,
**Restart story** or **Cancel**.

## Restart

**Restart story** (on **This chat → Play**) starts the story over in this chat. Your messages stay; the story's
progress and its memory are cleared. It asks first. It keeps this chat's feature changes, the flags you raised, and a
finished run you chose to carry on from.

## Swipes, edits and deletions

Change the chat however you like. When you swipe a reply, edit a message or delete one, the story steps back to
match, and **This chat → Play** says so ("The story stepped back to … to match your edit."). It moves forward again on
the next reply.

If an edit reaches back further than the chat can rewind, the story stays where it is and offers **Re-read from the
current scene** or **Restart story**.

## Talking out of character

To say something outside the story, wrap the whole message in double brackets, `((brb, dinner))`, or start it with
`OOC:` or `(OOC`. The characters still see it, but the story does not read it: it changes nothing in the story,
counts as no turn, is never remembered and is not listed in the story panel's log. Brackets inside an ordinary line, "I
say (quietly) hello", are read as usual. To correct the story, edit the message instead.

## Stuck? "What could I do?"

**What could I do?** in the wand menu beside where you type (or under **Beside the chat** on **This chat → Play**, which
closes the story window first) opens a panel over the chat and asks the memory model for four things you could try next. It sees only what you have already seen: the scenes you reached, the Play page (with the quests you are on)
and the recent messages, never the story's later scenes, a quest you have not found or anything a character keeps from
you. A suggestion that happens to name a place you have not reached yet is left out. Pick one and it is put in the box
where you type; nothing is sent until you send it, and it never replaces something you started typing. **Other ideas**
asks again. It calls the model only when you open it. A story can switch it off, and so can you in **Settings →
Display**.

## Skipping ahead

Travel, waiting and routine do not have to be played turn by turn. **Skip ahead** on the story card (click the scene
name above the chat box), or `/story skip`, asks the story's narrator for one reply that tells the time passing. It goes
to the next part of the day at most (morning to afternoon, say); for longer gaps, skip again. When something is due on
the way, the reply stops there instead. It never decides, says or feels anything for you and never shows what you have
not seen. A swipe of that reply keeps the skip; your next message ends it. It waits while a reply is being written,
before the story's first reply and while a check's outcome is still to be told, and an author can switch it off at a
scene. It is off until its blind rating passes: switch it on in **Settings → Features → Skip ahead** (then
**This chat → Settings** can switch it off for one chat).

## Asking a question

`/story ask <question>` answers questions about Story Orchestrator and about the story you are playing: "how do I pin a
memory?", "what is still open?". While you play it knows only what you have already seen: the scenes you reached, the
Play page and the recent messages. Ask it about something you have not reached and it says it can only talk about what
you have played. When the answer names a setting, **Show me** takes you there. It only reads; it never changes
anything. It uses the authoring model, one or a few calls per question, and can be switched off in **Settings →
Authoring → Ask questions**.

## People, promises and standing

Stories that keep them add pages that fill in as you play. They only ever show what you have learned, and a swipe or an
edit of the reply that taught you something takes it back.

- **People** and **Places**, in the **Journal**: a person or a place appears once you have learned something about it,
  and each line appears at the moment the story says you learned it. The counts are only of what shows. Someone you
  have not met is not listed at all.
- **How someone treats you**: on a person's page, a word for how they visibly treat you or someone else, such as "wary"
  or "rivals", never a number. A story can also hide a secret about a character; once something in the story reveals
  it, it shows on their page and stays learned.
- **Promised you**: on a person's page, something that character promised you, if you heard it said. They remember it
  and may keep it, raise it or break it, depending on what happens; nothing lapses just because time passed, and you
  owe nothing back.
- **Your promises**, on **This chat → Play**: promises you made to a character, quoted in your own words. Only that
  character is reminded, and only when the scene touches it; the story never decides for you whether you keep it.
  Switch it off in **This chat → Settings → Promises remembered**.
- **Standing**, on the **Stat sheet**: how the story's groups (a guild, a village) regard you, as a word such as "Wary"
  or "Trusted". What you do can raise or lower it, once per event, never for doing nothing.

## Finished stories and carrying a run on

When a story ends, **This chat → Play** says so ("The story has ended. You can keep playing on in the epilogue."), and
you can keep playing.

- **Finished stories**, under **Continue** in **Settings → Library**, lists the runs you finished, each checked
  first, with its ending and the milestones you earned that were not secret. **Open** takes you to that chat.
- **Carrying a run on**: when a story says it continues another (a sequel, or a replay of itself), its start page shows
  **Continue from a finished run**. Pick a run and the values its author chose carry over: a heritage line on
  **This chat → Play** (**From an earlier story**), a few starting facts, and a short "Previously…" note for the
  narrator for the first few turns. Only what you saw at the end carries, and a character knows a carried thing only
  if the author says so. **Start fresh** carries nothing.
- **Why a run is missing**: only runs that really ended, that you can still open, and that carry what the new story
  needs are listed (twenty at most). "No finished run of that story was found in your chats." means none qualified. A
  run that changed after the list was made is refused when you pick it; pick another, or start fresh.

**Save this run as a story**: in a living story, Author view offers to save what you played as a new story in your
library (**This chat → Author**). Only the scenes you reached are kept, so the saved copy never spoils a later play.

## Branches

A branch made from a chat that plays a story does not pick the story up on its own. The story bar shows
`branch — continue?`; click it, then **Continue from here** to carry on from where the branch ends.

## Finding your story chats

Groups and chats that play a story carry a small icon in SillyTavern's lists: the group list, the welcome
screen's recent chats and a group's past chats. A saga, a story its author marks as one (a whole campaign rather than
one of its acts), has its own icon. Hover or focus the icon for a card with the story, its chapter, where you are and
when you last played.

**Your stories**, under **Continue** in **Settings → Library**, lists every chat that plays a story, newest first;
**Open** takes you straight to it. The list fills in as you open chats, and once in the background after an update. A
chat keeps its row while it still plays its story, even after the story leaves your library.

Each of these can be switched off in **Settings → Display**, and a story can switch its own off; a story can
never turn one on that you switched off.

## Coming back after a break

After eight hours or more away, opening the chat shows a **Welcome back** recap: where you are, what happened
recently and what is still open.

## The /story command

Type these in the chat box. None of them spoil anything.

| Command | What it does |
|---|---|
| `/story recap` | Where the story is right now (the same as **This chat → Play**). |
| `/story threads` | What is still open. |
| `/story chapters` | The chapters that have ended, if the story uses chapters. |
| `/story chapter <n>` | One ended chapter's summary. |
| `/story chronicle export` | Copies the whole chronicle as Markdown. |
| `/story intro` | Opens the story briefing again. |
| `/story who` | Who you play in this story. |
| `/story quests` | The quests you have found and where each stands. |
| `/story flag [note]` | Marks this moment for the author to look at. |
| `/story skip` | Skips ahead: the narrator tells the time passing, up to the next part of the day, and stops where you are needed. |
| `/story guide [page]` | Opens this guide inside SillyTavern, at a page such as `player/memory`. |
| `/story ask <question>` | Answers a question about the plugin or the story, from what you have already played. |
| `/story tour [player\|author\|setup]` | Opens the guided tour. |

`/so-mem list`, `/so-mem pin <n> on|off` and `/so-mem exclude <n>` manage memories from the chat box (see
[Memory](memory.md)). `/cp` is an author tool and works only in Author view.

---

[Playing a story](README.md)
