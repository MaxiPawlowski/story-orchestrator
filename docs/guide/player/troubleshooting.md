# Troubleshooting and FAQ

## Start here: what are you seeing?

Find the row that matches, check what it says, and look for the success signal before moving on.

| You see | What to check | Is it normal? | What to do | It worked when |
|---|---|---|---|---|
| **No character reply at all** (your message posts, nothing answers) | SillyTavern's own connection: is the reply model running and selected? A popup waiting for you (Prompt Inspector)? A **check setup** row saying "Long chats will stop getting replies: lower the context size."? | No. The story does not write replies; your SillyTavern connection does. | Start the backend and re-select the connection profile. For the context row, see the last line of this table. | A reply appears. |
| **Replies arrive, but the story never moves**, and the Status line says "The memory model is not answering — the story will catch up when it does." or "The story stopped keeping up — something went wrong reading the scene." | The memory model: **Orchestrator → Connections → Memory**, then **Test memory model**. | Briefly, yes: it retries on its own and catches up once the model answers. | Start the memory model's backend, then **Try again** on **This story → Play**. | Status reads "Following along." and the `not keeping up` chip is gone. |
| **`N updates next turn`** on the story bar | Nothing: a read found something. | Yes. Findings apply after the next reply finishes, one scene change per reply. | Keep playing. | After the next reply the chip clears and the story bar shows the new scene. |
| **The scene stays put**, Status says "Following along." (maybe "What happens next is yours to decide.") | Whether the chat shows what the scene is waiting for. Reads run every three character replies by default. | Yes, until the chat shows it. | Write it happening in the chat ("We leave the tavern and take the north road."), not only thinking it. To read straight away: **This story → Features → Story reading → Read now**. | A read lands: `N updates next turn`, then the new scene. |
| **`check setup`** with "… is not answering, so … stands in until it answers again", "The story so far pauses until the model answers again." or "A model the story uses is not answering, so another one is standing in until it is back." | **Orchestrator → Connections → Memory → Models per task**: which task, and its **Test** button. | Yes for a short outage: it is retried on its own, and the chat stays playable. | Start that model's backend, or pick another profile for the task. | The row leaves the setup list. |
| **`check setup`** with "Long chats will stop getting replies: lower the context size." | The reply connection asks for more context than its server holds. | No: long chats will stop getting replies. | Set the preset's context to what the server serves, or tick **Derive context size from backend** in SillyTavern's connection settings. | The row leaves the setup list, and long chats keep getting replies. |

If none of these fit, open **This story → Play** and read the **Setup** list and the **Status** line.

## How the setup list and Repair work

**This story → Play → Setup** lists every problem at once: **Stops the story** first, then **Weakens the story**, then
**Good to know**. Each says what it costs the story, with **Show me** and, where one exists, a one-click fix. The story
bar's `fix setup (N)` and `check setup (N)` chips count the same list.

**Repair** (in **Orchestrator → Library**, or **Extensions → Story Orchestrator → Story setup and repair**) shows only
the single most important problem, so you fix them one at a time; when one is fixed, the next takes its place.

**I know, keep it** hides a problem that only weakens the story, on this install. Hidden problems sit under **N
dismissed** at the bottom of the setup list; **Show again** brings one back. A problem that stops the story cannot be
hidden.

## The story does not move

The Status line on **This story → Play** says what the story is doing:

| You see | What it means | What to do |
|---|---|---|
| "Nothing is following the story yet — choose a memory model in the extension settings." | No memory model is chosen. | Pick one: [Memory model](../setup/memory-model.md). |
| "Nothing is following the story — the memory model it used cannot be reached." | The model connection it used is gone or down. | Choose another, or start your backend. |
| "The story will not move on its own — turn that on in the extension settings." | Story reading is switched off. | **Open story settings** and switch on **Story reading**. |
| "The memory model is not answering — the story will catch up when it does." | Your backend is down or busy. | Check your model is running, then **Try again**. |
| "Catching up — re-checking recent scenes." | A scene is taking longer than expected. | Keep playing. It catches up on its own. |
| "Catching up after your edit…" | Editing the last reply stepped the story back to before it; it is re-reading the edited text. Until that read lands (a few seconds), a reply is built from the pre-edit state. | Wait for it to clear before you send, if the edit should count for the next reply. |
| "What happens next is yours to decide." | The story waits for you to act. | Do or say something in the scene. |

A story only moves on what the chat shows. If a scene should be over but is not, write it happening in the chat
rather than only thinking it. Authors debugging a scene that never opens: Author view's **Blackboard** shows the
evidence each tracked value was read from.

## The story says it still needs something

- "Your character is not ready in this chat.": the story was written for a specific persona. Select it.
- "The cast is not ready in this chat.": a character is missing from the group, or muted. Repair names them and
  **Show me the group** opens the member list.
- "The story's background lore is not ready in this chat.": a lorebook it needs is missing. Import it.

## "check setup" from another extension or your model

The story still plays, but something in your setup weakens it. These show in player mode too, so a story you
downloaded can tell you; Author view adds the technical detail.

| You see | What it means | What to do |
|---|---|---|
| "Characters' private intentions are not being tracked, because the model is not thinking before it replies. Turn on reasoning (thinking) in your model's settings to play this as intended." | The last 5 replies in this chat carried no reasoning, so the inner voice has nothing to read. | Turn on reasoning for your model connection (or its preset or instruct template). It clears once a reply carries reasoning. |
| "Summarize shares the whole chat with every character, …" (or Vector Storage) | Another extension puts the whole chat into every character's prompt, so a character can learn what was kept from them. | Switch that extension off while the story plays. |
| "Stepped Thinking posts characters' thoughts as chat messages, so the story treats a thought as something that happened. …" | Stepped Thinking is in its old "Separated" mode, which posts every thought into the chat. The story reads each one as a reply: it remembers it and can move on because of it. | In Stepped Thinking's settings set **Mode** to "Embedded", or switch it off while the story plays. **Show me** opens its settings. |
| "Presence hides parts of the chat from each character, and the story's memory can read the chat while it is hidden, …" | Presence hides what a character did not witness while that character is about to speak, and a memory read in that moment sees only that view. | Untick **Enable Presence** while the story plays; the story already keeps track of who knows what. **Show me** opens its settings. |
| "Prompt Inspector is on, so every reply waits for you to confirm its prompt in a popup. …" | Prompt Inspector's inspect toggle is on (it is kept in this browser), so it stops before every reply, once per character in a group turn. | Choose **Stop Inspecting** in SillyTavern's extensions menu (the magic wand). |

Author view also lists one note that never raises the story bar's count: **Vector Storage can switch on lorebook
entries by itself** shows for a story that uses exclusive lore selection while Vector Storage's **Enable for World
Info** is on, because exclusive lore stays off then. Untick it under Vector Storage's World Info settings (**Show me**
opens them), or dismiss the note.

## "changes not saved yet"

SillyTavern did not confirm the last save of the story's progress. The changes are kept in this page and go with the
next save. **Do not reload yet**: reloading before a save lands can lose them.

1. Keep this page open. Check that SillyTavern's server is still running (its terminal window, or open SillyTavern in
   a second tab to see that it answers).
2. Once the server answers, carry on: the next reply saves everything that was waiting.
3. The notice leaves the setup list when that save lands. Then it is safe to reload.

If the server cannot be brought back, keep evidence before restarting it: **Orchestrator → Help → Setup → Host
capabilities → Copy for a bug report**, and note the chat's name. SillyTavern also keeps dated copies of each chat in
its data folder's `backups`.

## "saved by another version of Story Orchestrator"

This chat's story data comes from a version this one cannot read. **Restart** replaces it with a fresh start; your
messages stay.

## A character knows something they should not

Flag the moment with **Flag this moment** on **This story → Play**, or `/story flag <what went wrong>`. Flags go to the
session journal for the author.

## FAQ

**Does it work in a one-on-one chat?** No: stories play in group chats. In a one-on-one chat the story stays off, and
**Orchestrator → Library** offers **Make a group for this story**: it asks first, makes a new
group with the story's cast (nothing you already have is changed), sets it to start the story and opens it. A group of
one character is fine. If a card the story needs is missing, it says which and offers **Fix with wizard** instead of
making a partial group.

**Does it slow down replies?** Mostly not: story reads, memories and summaries run after the reply. A few things can
add to the wait before a reply: the judge's speaker and lore picks (1.5 seconds at most), preparing a character's
private intent when none is ready (up to 3 seconds), and catching up after you edit the last reply (up to 15 seconds).
The full list: [Costs and waiting](../setup/README.md#costs-and-waiting).

**Can I edit, swipe and delete as usual?** Yes. The story steps back to match.

**Does a story change my other chats?** No. A story's lore, cast changes and background apply only in the chat that
plays it, and are undone when you leave it.

**Is anything sent to the internet?** Only to the models you configured. The optional judge sends short excerpts to
its provider; see [Judge](../setup/judge.md).

**Where do I report a bug?** **Orchestrator → Help → Setup → Host capabilities** has **Copy for a bug report**.

---

[Playing a story](README.md)
