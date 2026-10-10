# Quick start

From nothing to playing the bundled example story, *Quest for the Sun Ruins*, in about fifteen minutes. You need a
working SillyTavern (1.19.0 is the tested version) with a model connected for replies.

**Stories play in group chats.** The example's cast is four characters: a narrator and three companions.

## 1. Install the extension

There is no published release yet, so build it from the source:

```bash
git clone https://github.com/MaxiPawlowski/story-orchestrator
cd story-orchestrator
echo <your SillyTavern folder> > .st-root
npm ci
npm run build
npm run stage
```

`stage` copies the built extension into SillyTavern. Reload SillyTavern: **Extensions → Story Orchestrator** appears.
Skip this step if you are reading this inside SillyTavern.

## 2. Choose a memory model

The memory model reads the chat after each reply and moves the story on. It is the one required setting.

1. In SillyTavern, save a **Connection Manager** profile for a model, with the instruct template that matches it.
   Your reply model is fine to start with.
2. In **Extensions → Story Orchestrator → Memory**, pick it as the **Memory model profile**.
3. Press **Test memory model**.

## 3. Bring in the example's cast and lore

The files are in the repository's `examples/sun-ruins/` folder.

1. **Characters → Import** the four cards: `DM Narrator.png`, `Arin.png`, `Ponticius.png`, `Luke.png`.
2. **World Info → Import** `Xentar Checkpoints.json`. You do not need to switch it on: the story loads it in its own
   chats.
3. Create a **group** with all four characters and open its chat.

## 4. Load the story and play

1. In **Extensions → Story Orchestrator**, choose **Start → Import a story**, pick or paste
   `quest-for-the-sun-ruins.json`, and press **Import and load**.
2. If a **Before you start** page opens, read it and close it.
3. Write your first message, in character. The story follows from there.

The bar above the chat box shows the current scene; click it to open the story drawer. If something is missing, the
**Repair** row in the settings names it and **Show me** takes you there.

## Where next

- [What you see while playing](player/README.md)
- [Choosing models](setup/models.md): which model to use for each job
- [Write your own story](author/README.md)
