# Story Orchestrator guide

Story Orchestrator is a SillyTavern extension that plays authored stories over a chat: scenes that open in order,
characters who enter and leave, lore that switches on when it matters, and a memory of what happened. You play by
chatting, as always.

**Stories play in group chats.** Each character keeps their own voice and what they know, so a story needs a group
with its cast, even a one-character story (that character plus a narrator). In a one-on-one chat the story stays off
and offers to make the group for you.

| You want to | Read |
|---|---|
| Install it and play something in five minutes | this page |
| Understand what you see while playing | [Player guide](player/README.md) |
| Fix "the story does not move" | [Troubleshooting](player/troubleshooting.md) |
| Set up the memory model, the judge, images or the harness | [Setup](setup/README.md) |
| Write your own story | [Author's guide](author/README.md) |
| Work on the code | [Developer docs](../dev/contributing.md) |

This guide also ships inside the extension: **Help → Open the guide**, any **Read more** in Help, or `/story guide`.
Author pages show there only in Author view.

## Install

**From a release zip (recommended).** A release is one file, `story-orchestrator-<version>.zip` (attached to a GitHub
release, or built with `npm run package`). Unzip it so that its `story-orchestrator/` folder lands at

```
<SillyTavern>/public/scripts/extensions/third-party/story-orchestrator
```

The zip already holds the built extension (`dist/`), the example story and the optional server plugins. Reload
SillyTavern; the panel appears under **Extensions → Story Orchestrator**.

**From source.** Clone the repository anywhere outside SillyTavern, then:

```bash
echo <SillyTavern root> > .st-root     # or set ST_ROOT; the build records hashes of SillyTavern's files
npm ci
npm run build
npm run stage
```

`dist/` is not in the repository, so the build is not optional. `stage` copies exactly the files a release would
ship into the extension folder (and refuses a folder that holds a source checkout).

Server plugins are optional and installed separately: [Server plugins](setup/README.md#server-plugins).

### Tested on

The extension is exercised against one host at a time; this is the one it was last exercised on.

| | |
|---|---|
| SillyTavern (live play) | 1.19.0, commit `7c399419636c4df3d6d035fcddf9ccbb8248b432` (`host.commit` in `dist/manifest.json`) |
| SillyTavern (clean install) | 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127` (`release`, cloned clean): machine gates only, no live play |
| Declared older host | 1.18.0 (`minimum_client_version`), commit `51ad27fb86d39a3daca3adaa970375c9670c12df`: typecheck, lint, test, build and release tests green; not played through |
| Host files | the SillyTavern modules the extension imports, hashed in `dist/manifest.json` → `host.files` |
| Browser | Chromium, desktop and a 390×844 phone viewport |
| Main model | TheDrummer Artemis 31B v1.1 Q4_K_M on llama.cpp, Connection Manager profile |
| Memory model | the same profile; an **instruct template is required** (an untemplated prompt degenerates into token loops) |

**Not tested on other SillyTavern versions.** The extension imports SillyTavern modules by path (`/script.js`,
`/scripts/world-info.js`, …) and hashes them at build time, so a version whose files differ is one nobody has run it
against. **Diagnostics → Host capabilities** reports each feature it probes (`macros`, `slashCommands`,
`backgrounds`, `vectors`, `judge`) as present, absent or error, and **Copy for a bug report** pastes the whole picture.

## First story in five minutes

1. **Choose a memory model.** In SillyTavern, make a Connection Manager profile for a model (with the right instruct
   template). In **Extensions → Story Orchestrator → General setup**, pick it as the **Memory model profile** and
   press **Test memory model**. ([More](setup/memory-model.md))
2. **Get a story.**
   - The bundled example: **Start → Import a story** and load
     `examples/sun-ruins/quest-for-the-sun-ruins.json`. It needs four character cards, a group and a lorebook, all in
     the same folder ([how](author/examples.md)).
   - Or your own: turn on the wizard under **Author services**, then **Start → New story (wizard)**. Describe a
     premise; it proposes the story and offers to create the cards, lorebook and group, one at a time.
3. **Open the story's group chat** and choose the story under **Continue** if it is not already playing.
4. **Play.** Click the story bar above the chat box to open the drawer: where you are, what happened, what is open.
   If something is missing, **Repair** names it.

---

Story Orchestrator is AGPL-3.0. Source: <https://github.com/MaxiPawlowski/story-orchestrator>.
