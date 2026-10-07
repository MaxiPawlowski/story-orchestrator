# Memory

After each reply, a second model (the *memory model*) reads the recent chat and writes down what matters: facts,
details of the current session, a short summary of the last few turns, and a history of past scenes. Those notes go
back into the prompt, so characters remember what happened long after it scrolled out of view.

The memory model is chosen once for the whole install (see [Memory model](../setup/memory-model.md)). Without one,
nothing is remembered and the story does not move on its own.

## The Memory tab

The drawer's **Memory** tab, "What the story remembers", lists every memory in four groups: **Facts**, **Session
details**, **Short-term** and **Scene history**.

On each memory:

- **Pin** keeps it in the prompt even when space runs short (📌). If pinned memories do not all fit, the tab says
  how many were left out.
- **Edit** fixes the wording. An edited memory is marked "kept by you".
- **Exclude** removes it. A toast lets you undo for a few seconds.

"The message it came from changed" means you edited or swiped the message the memory was read from; check it.

Filter by **Character**, and past 50 memories use **Find** to search.

## Memorize an existing chat

**Memorize chat** reads the whole chat history into memory, for a chat that started before the extension was on.
It shows progress (`Memorizing: 3/12`) and can be stopped.

## Private knowledge

In a group, each character knows only what they saw or were told. A secret one character keeps is not shown to the
others' replies. A memory that would give such a secret away is left out of the Memory tab, or shown without the
sentence that does. You do not need to do anything for this.

## Chapters

Some stories end chapters as they go. When one ends, a **Previously** card shows its summary, and the chapter
appears under **Your story** in the Overview. Older memories are folded into the chapter summary so the prompt stays
small. A wrong summary can be flagged with ⚑.

---

[Playing a story](README.md)
