# The setup wizard

The wizard turns a premise into a playable story, and creates the character cards, lorebook and group it needs.
Turn it on under **Authoring** in the settings, then use **Start → New story (wizard)** or the Studio's
**Wizard** tab.

## The four steps

| Step | What it settles |
|---|---|
| Premise | What the story is about, and what it measures as it goes. |
| Turning points | The beats, and what has to be true to move between them. |
| Characters | Who is in it, what they want, and where their threads point. |
| Setup | Create the cards, lore and group this story needs to run. |

These are the same four steps as [Build a story step by step](step-by-step.md). The wizard writes through the same
edits you would make by hand, so everything it does shows in the Studio.

When a choice is yours, it asks. **You decide** lets it pick and carry on.

## The story agent

The agent version of the wizard plans first ("Waiting for you to agree the plan"), then works one change at a time.
Choose its mode:

- **Review every change**: each change waits for you to accept, edit or reject it (with a reason it reads).
- **Write to the draft, review before saving**: changes go into the draft; you review before you save.

It reads this guide (`readGuide`) and can check reachability and walk the story before it finishes. **Note to the
agent** steers its next step; **Continue** resumes after it finishes.

The agent runs on the model chosen for **Wizard and road ahead** under **Models per task** (by default, the memory
model). That task can also be routed to opencode on the SillyTavern server, through the
[harness plugin](../setup/harness.md); then the agent calls its tools natively, and it does not fall back to the
local profile when the harness is unavailable.

## What it creates on your install

The wizard only ever **creates**; it never edits or deletes a card, lorebook or group that already exists.

- Each card, lorebook and group is proposed as its own card. You read it and press **Create it**. Nothing is
  created by "accept all".
- It never creates a persona; personas are yours.
- A group it builds holds only this story's cast.
- A story's lorebooks are switched on only in the chats that play that story, never for every chat.

"Fix with wizard" (Repair, or the requirements panel in Author view) starts it on just the missing cards and books
of an existing story.

---

[Author's guide](README.md)
