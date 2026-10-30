# Memory

A second model (the *memory model*) reads the recent chat every few character replies (every three by default, and
sooner when a scene changes) and writes down what matters: facts, details of the current session, a short summary of
the last few turns, and a history of past scenes. Those notes go back into the prompt, so characters remember what
happened long after it scrolled out of view.

The memory model is chosen once for the whole install (see [Memory model](../setup/memory-model.md)). Without one,
nothing is remembered and the story does not move on its own.

## What the story remembers

Open **This story → Play → What the story remembers**. It lists every memory in four groups: **Facts**, **Session
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

## Memorize an existing chat

**Memorize chat** reads the whole chat history into memory, for a chat that started before the extension was on.
It shows progress (`Memorizing: 3/12`) and can be stopped.

## Private knowledge

In a group, each character knows only what they saw or were told. A secret one character keeps is not shown to the
others' replies. A memory that would give such a secret away is left out of the list, or shown without the sentence
that does. You do not need to do anything for this.

After each story read the extension also notes **who heard what**, in code and without adding to the read: for every
message, the speaker and the group's enabled characters seen on stage, and for a whispered or aside part only the
speaker and the character it names. Nothing uses this record yet; it is measured first. A swipe or edit takes the affected notes back. Switch it off in **This story → Features → Who heard
what** (or for every chat in **Orchestrator → Defaults**).

## Threads you put off

The story keeps a list of open threads: unresolved conflicts, mysteries, goals still in motion. When you put one off in
your own words ("later", "not now", "let's leave that"), the next story read marks it as **put off**, with your exact
words as the evidence. It is then no longer offered as the current thread, your thread list shows it as "(put off)",
and **What could I do?** can still suggest it as an older thread. It is picked up again as soon as you mention it
yourself; nothing brings it back on a timer. A character saying "later" never counts, and a swipe or edit takes the
change back. The characters still see a put-off thread for now: leaving it out of their prompt is a separate control
(**Leave put-off threads out of the prompt**), off until its replies are rated. Switch the feature off in **This story →
Features → Threads you put off** (or for every chat in **Orchestrator → Defaults**).

## Chapters

Some stories end chapters as they go. When one ends, a **Previously** card shows its summary, and the chapter
appears under **Your story** on **This story → Play**. Older memories are folded into the chapter summary so the prompt
stays small. A wrong summary can be flagged with the flag button on that chapter.

---

[Playing a story](README.md)
