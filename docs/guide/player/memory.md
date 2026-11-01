# Memory

A second model (the *memory model*) reads the recent chat every few character replies (every three by default, and
sooner when a scene changes) and writes down what matters: facts, details of the current session, a short summary of
the last few turns, and a history of past scenes. Those notes go back into the prompt, so characters remember what
happened long after it scrolled out of view.

The memory model is chosen once for the whole install (see [Memory model](../setup/memory-model.md)). Without one,
nothing is remembered and the story does not move on its own.

## What the story remembers

Open **This chat → Play → What the story remembers**. It lists every memory in four groups: **Facts**, **Session
details**, **Short-term** and **Scene history**.

<a id="pinning"></a>
### Pin, edit or exclude

On each memory:

- **Pin** keeps it in the prompt even when space runs short (📌). If pinned memories do not all fit, the list says
  how many were left out.
- **Edit** fixes the wording. An edited memory is marked "kept by you".
- **Exclude** removes it. A line at the top of the list says so and offers **Undo** until you exclude another one.

"The message it came from changed" means you edited or swiped the message the memory was read from; check it.

Filter by **Character**, and past 50 memories use **Find** to search.

<a id="which-memories"></a>
### Which memories each reply gets

Three switches decide which memories reach a reply. All are on; in Author view they sit under **Settings → Authoring →
Prompt trials**, and none calls a model.

- **Pick memories from the last few messages.** Memories are scored against the last four messages (newer ones count
  more), the character about to speak and who is on stage, not the last line alone. A memory counts as recent when the
  chat last mentioned it, never because it was already in a prompt.
- **Hold back what a character just said.** When a character's reply restates a memory, that memory leaves that
  character's own memory notes for the next six turns, so the same callback is not offered every reply. Your next
  message brings it back at once if it names it. The other characters keep it.
- **Keep the memories the story uses.** A memory a reply used gets stronger; strength fades over turns. When a group is
  full, the weakest memory moves to the archive instead of the oldest being deleted, and the archive brings it back when
  the chat names it ("Recalled from earlier: …"). Pinned, locked and edited memories never move.

A swipe or edit takes back what the replaced reply counted as said or used.

## Memorize an existing chat

**Memorize chat** reads the whole chat history into memory, for a chat that started before the extension was on.
It shows progress (`Memorizing: 3/12`) and can be stopped.

## Private knowledge

In a group, each character knows only what they saw or were told. A secret one character keeps is not shown to the
others' replies. A memory that would give such a secret away is left out of the list, or shown without the sentence
that does. You do not need to do anything for this.

After each story read the extension also notes **who heard what**, in code and without adding to the read: for every
message, the speaker and the group's enabled characters seen on stage, and for a whispered or aside part only the
speaker and the character it names. Nothing uses this record yet; it is measured first. A swipe or edit takes the affected notes back. Switch it off in **This chat → Story settings → Who heard
what** (or for every chat in **Settings → Features**).

## Threads you put off

The story keeps a list of open threads: unresolved conflicts, mysteries, goals still in motion. When you put one off in
your own words ("later", "not now", "let's leave that"), the next story read marks it as **put off**, with your exact
words as the evidence. It is then no longer offered as the current thread, your thread list shows it as "(put off)",
and **What could I do?** can still suggest it as an older thread. It is picked up again as soon as you mention it
yourself; nothing brings it back on a timer. A character saying "later" never counts, and a swipe or edit takes the
change back. The characters still see a put-off thread for now: leaving it out of their prompt is a separate control
(**Leave put-off threads out of the prompt**), off until its replies are rated. Switch the feature off in **This chat →
Settings → Threads you put off** (or for every chat in **Settings → Features**).

## Memory upkeep switches

Four switches under **This chat → Settings → Prompt memory** (or **Settings → Features**) tune how memory looks after
itself. All are on; each can be switched off on its own to compare.

- **Count real tokens when dropping old messages**: when chunked dropping of old messages is on, each message is measured
  with the model's own tokenizer, so SillyTavern does not trim further messages between two cuts.
- **Keep the recent summary from losing names**: a new rolling summary of recent play is refused, and the previous one
  kept, when it drops a person, place or thing that no other memory still holds, or shrinks below 60% of the old one.
- **Settle unclear old-versus-new memories while idle**: when two memories might be an old and a new version of the same
  thing, the memory model gets one short question while nothing is being written; the answer applies at the next reply
  (the old memory is retired, or both are kept). A swipe or edit takes it back.
- **Match places and things to the story's names**: places, groups and things the story names are recorded under the
  story's spelling, so two spellings of one place are one entry.

## Chapters

Some stories end chapters as they go. When one ends, a **Previously** card shows its summary, and the chapter
appears under **Your story** on **This chat → Play**. Older memories are folded into the chapter summary so the prompt
stays small. A wrong summary can be flagged with the flag button on that chapter.

---

[Playing a story](README.md)
