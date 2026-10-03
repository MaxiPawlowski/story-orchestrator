# Troubleshooting and FAQ

Start with the drawer's **Status** line and the settings panel's **Repair** row. Repair always names the single most
important thing to fix, and **Show me** takes you to the control. The drawer's **Setup** list shows every problem at
once: the ones that stop the story first, then the ones that weaken it.

## The story does not move

| You see | What it means | What to do |
|---|---|---|
| "Nothing is following the story yet — choose a memory model in the extension settings." | No memory model is chosen. | Pick one: [Memory model](../setup/memory-model.md). |
| "Nothing is following the story — the memory model it used cannot be reached." | The model connection it used is gone or down. | Choose another, or start your backend. |
| "The story will not move on its own — turn that on in the extension settings." | Story reading is switched off. | **Open story settings** and switch it on. |
| "The memory model is not answering — the story will catch up when it does." | Your backend is down or busy. | Check your model is running, then **Try again**. |
| "Catching up — re-checking recent scenes." | A scene is taking longer than expected. | Keep playing. It catches up on its own. |
| "What happens next is yours to decide." | The story waits for you to act. | Do or say something in the scene. |

A story only moves on what the chat shows. If a scene should be over but is not, write it happening in the chat
("We leave the tavern and take the north road.") rather than only thinking it.

## The story says it still needs something

- "Your character is not ready in this chat.": the story was written for a specific persona. Select it.
- "The cast is not ready in this chat.": a character is missing from the group, or muted. Repair names them and
  **Show me the group** opens the member list.
- "The story's background lore is not ready in this chat.": a lorebook it needs is missing. Import it.

## "changes not saved yet"

SillyTavern did not confirm the last save. The changes go with the next save. If it stays, check that SillyTavern's
server is running and reload the page.

## "saved by another version of Story Orchestrator"

This chat's story data comes from a version this one cannot read. **Restart** replaces it with a fresh start; your
messages stay.

## A character knows something they should not

Flag the moment with ⚑ in the drawer, or `/story flag <what went wrong>`. Flags go to the session journal for the
author.

## FAQ

**Does it work in a one-on-one chat?** No: stories play in group chats. In a one-on-one chat the story stays off, and
the settings panel and the drawer offer **Make a group for this story**: it asks first, makes a new group with the
story's cast (nothing you already have is changed), sets it to start the story and opens it. A one-character story is
a group of that character plus its narrator. If a card the story needs is missing, it says which and offers **Fix with
wizard** instead of making a partial group.

**Does it slow down replies?** The memory model reads after the reply, not before it. With the optional judge, two
of its uses (speaker direction and lore selection) run before a reply and give up after 1.5 seconds.

**Can I edit, swipe and delete as usual?** Yes. The story steps back to match.

**Does a story change my other chats?** No. A story's lore, cast changes and background apply only in the chat that
plays it, and are undone when you leave it.

**Is anything sent to the internet?** Only to the models you configured. The optional judge sends short excerpts to
its provider; see [Judge](../setup/judge.md).

**Where do I report a bug?** The settings panel's **Host capabilities** block has **Copy for a bug report**.

---

[Playing a story](README.md)
