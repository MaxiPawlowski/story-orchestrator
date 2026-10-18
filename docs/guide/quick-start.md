# Quick start

Five steps from a fresh install to a story that plays. Inside SillyTavern each step ticks itself when it is done, and
**Show me** points at the place on screen. You need a working SillyTavern (1.19.0 is the tested version) with a model
connected for replies.

Not installed yet? Follow [Install](setup/README.md#install) first.

## The checklist

1. <!-- so:check memory --> **Pick a memory model.** It reads the chat after each reply and moves the story on; it is
   the one setting a story needs. Save a **Connection Manager** profile for a model with its matching instruct
   template (your reply model is fine to start with), then choose it in **Extensions → Story Orchestrator → Open Story
   Orchestrator → Orchestrator → Connections → Memory model** and press **Test memory model**.
   <!-- so:show setup:memory -->
2. <!-- so:check group --> **Open a group chat.** Stories play in group chats whose members are the story's cast. For
   the bundled example, import the four cards from the repository's `examples/sun-ruins/` folder (**Characters →
   Import**: `DM Narrator.png`, `Arin.png`, `Ponticius.png`, `Luke.png`) and its lorebook (**World Info → Import**
   `Xentar Checkpoints.json`; you do not need to switch it on), then create a group with all four and open its chat.
3. <!-- so:check story --> **Import or start a story.** In **Orchestrator → Library**, press **Import a story**, pick
   or paste `quest-for-the-sun-ruins.json` and press **Import and load**. **New story (wizard)** builds one from your
   own idea instead. If a **Before you start** page opens, read it and close it. <!-- so:show player:library -->
4. <!-- so:check reply --> **Play a turn.** Write your first message in character and send it. When the reply ends,
   the strip above the chat box shows the current scene; click it to open **This story → Play**.
   <!-- so:show player:hud -->
5. **Know where things live.** **This story → Play → What the story remembers** lists what the story kept from your
   chat. If something is missing, a repair card on the same page (and a **fix setup** or **check setup** chip on the
   strip) says what will not happen, and **Show me** takes you to the fix. <!-- so:show player:memory -->
   <!-- so:show player:repair -->

## Tours

**Orchestrator → Help → Take the tour** (or `/story tour` in the chat box) offers three short tours that point at the
real controls one at a time: playing a story, writing stories, and setting up. `/story tour player`, `/story tour
author` and `/story tour setup` start one directly.

## Where next

- [Setup path](setup/setup-path.md): turn on and check every other part, level by level
- [What you see while playing](player/README.md)
- [Choosing models](setup/models.md): which model to use for each job
- [Costs and waiting](setup/README.md#costs-and-waiting): what each part costs and when replies wait
- [Write your own story](author/README.md)
