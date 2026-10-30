# Setup

Only one thing is required: a **memory model**. Everything else is optional, and the story plays without it.
The [Setup path](setup-path.md) puts every part in order, level by level.

| Piece | Needed for | Page |
|---|---|---|
| Memory model (a Connection Manager profile) | The story moving on its own, memory, summaries | [Memory model](memory-model.md) |
| A model for each job | Better results: a prose model for replies, a strict one for reads, a tool-calling one for the wizard | [Choosing models](models.md) |
| Judge plugin + a TypeSafe key | Faster, more careful choices: speaker picks, lore selection, memory checks, scene tracking | [Judge](judge.md) |
| An image service | Illustrations and sprites | [Illustrations](images.md), [Sprites](sprites.md) |
| GPU plugin | A local text model and local images sharing one graphics card | [One GPU for text and images](gpu-sharing.md) |
| Harness plugin | Running tasks through Claude Code, Codex or opencode logins on the server | [Harness](harness.md) |

## Install

This is the one install procedure; other pages link here. There is no published release yet, so you build the
extension from its source and copy it into SillyTavern.

**You need:** a working SillyTavern (1.19.0 is the tested version, see [Tested on](#tested-on)), Git, and Node.js 22
with the npm that comes with it (tested on Node 22.22 and npm 10.9). Clone the repository anywhere **outside** the
SillyTavern folder, and run every command from inside the cloned folder.

In **PowerShell** (Windows). The example assumes SillyTavern is in a `SillyTavern` folder in your user folder; replace
`"$HOME\SillyTavern"` with your own SillyTavern folder (the one that holds `server.js`) if it is elsewhere:

```powershell
git clone https://github.com/MaxiPawlowski/story-orchestrator
cd story-orchestrator
Set-Content -Path .st-root -Value "$HOME\SillyTavern"
npm ci
npm run build
npm run stage
```

In **Bash** (Linux, macOS, or Git Bash on Windows). Replace `"$HOME/SillyTavern"` the same way; keep the quotes when
the path has spaces:

```bash
git clone https://github.com/MaxiPawlowski/story-orchestrator
cd story-orchestrator
printf '%s' "$HOME/SillyTavern" > .st-root
npm ci
npm run build
npm run stage
```

What each step does:

- `.st-root` tells the build and the copy step where SillyTavern is; it is never guessed. Setting the `ST_ROOT`
  environment variable instead works too. The build reads it because it records hashes of the SillyTavern files the
  extension uses.
- `npm ci` installs the build tools. `npm run build` writes the extension to `dist/`, which is not in the repository,
  so the build is not optional.
- `npm run stage` copies exactly the files a release would ship into
  `<SillyTavern>/public/scripts/extensions/third-party/story-orchestrator` (and refuses a folder that holds a source
  checkout).

**It worked when:** after you reload SillyTavern in the browser, **Extensions** has a **Story Orchestrator** block with
an **Open Story Orchestrator** button. If `stage` refused, its message names what is wrong (usually `.st-root` pointing
at the wrong folder).

**To update:** `git pull`, then run `npm ci`, `npm run build` and `npm run stage` again, and reload SillyTavern.

`npm run package` builds a release zip from a clean checkout instead. Unzip it so its `story-orchestrator/` folder
lands in SillyTavern's `public/scripts/extensions/third-party/`.

## Where settings live

Everything is in one window: **Extensions → Story Orchestrator → Open Story Orchestrator**. The route icon in
SillyTavern's top bar opens the same window at **This chat → Play**.

| Half | Page | What is there |
|---|---|---|
| **This chat** (the open chat) | **Play** | Where you are, setup problems, what the story remembers, Restart story |
| | **Settings** | The story for this chat and for new chats in the group, this chat's change to each feature, the **Author view** switch |
| | **Review**, **Author** | Only while Author view is on: proposals waiting for you, tracked values, activity, the story's internals |
| **Settings** (every chat) | **Library** | Start (New story, Import a story), Continue, Repair, Author |
| | **Features** | Every feature, on or off for all chats, each with its own controls; off here is a master switch |
| | **Models** | Memory model, fallback, the model test, models per task |
| | **Judge** | The judge key and switch, and the one list of judge checks |
| | **Images & stage** | Picture service, when pictures are drawn, picture types, model sources, the sprite stage |
| | **World & lore** | How story lorebooks are scanned, and story books still on for every chat |
| | **Display** | Notes under messages, the status strip, briefings, panels and list marks |
| | **Authoring** | The wizard, Ask, the chapter budget, a link to the Author view switch |
| | **Diagnostics** | Host capabilities and a copy for bug reports |
| | **Help** | **Take the tour**, **Setup path**, the guide and Help and Ask |

**Search all settings** at the top of the window finds any setting and jumps to it. Every setting has one home; other
pages link to it with **Change**. A row marked **This device** can keep its own value in this browser. The guide opens
with `/story guide`, and Ask with `/story ask <question>`.

![Sketch of a settings page: one row per setting, its control on the right](../assets/settings-sections.png)

Settings have four scopes: **install** (every chat), **story** (what the author chose), **chat** (your change for the
open chat) and **device** (display preferences kept in this browser). How they combine, with an example, and every
setting with its default: [Settings reference](settings-reference.md#where-settings-live).

**Extensions → Story Orchestrator → Story setup and repair** jumps straight to the first thing that is missing.

## Story lorebooks

A story names the lorebooks it needs. Import them into SillyTavern (**World Info → Import**) and stop there: you do not
select them globally. Story Orchestrator adds a story's books to the lorebook scan of the chats that play that story,
and only those chats; a book selected globally reaches every chat, and Repair offers to deselect it.

Inside a story's own books, entries a scene switches on or off rest off in their files, and each chat sees the ones its
own path through the story has switched on. **Settings → World & lore → Lorebooks** can switch to file
writes instead, where entries are switched on and off in the files as the chat moves; leave the default unless the
setting's help says your host needs it.

The **Lorebook curator** proposes edits to a story's lorebooks as the story moves (only the books the story allows,
and nothing lands until you accept it in **This chat → Review**). It is on by default; switch it off in
**Settings → Features → Lorebook curator** or for one chat in **This chat → Story settings**. How authors set up story
lore is in the author pages (in the in-app guide they show only in Author view).

## Costs and waiting

What runs while you wait for a reply, and what runs after it.

**Before a reply** (adds to the wait):

- **Speaker direction** with the judge: at most 1.5 seconds, then the usual pick.
- **Lore selection** with the judge: at most 1.5 seconds, then the usual lore.
- **Private inner voice**: usually prepared in the background after the previous reply. If the character about to
  speak has no fresh intent, preparing one can add up to 3 seconds before their reply.
- **Reply thinking** (llama.cpp only): the reply model thinks before it writes. Medium caps that at 400 tokens.
- **After you edit the last reply**: your next reply can wait up to 15 seconds while the edit is read (the
  "catching up after your edit" chip).
- **One local GPU**: a story read, a summary or a picture on the same card as your reply model competes with the
  reply. With the [GPU plugin](gpu-sharing.md), a reply asked while a picture renders waits for it.

**After a reply** (you do not wait): story reads, memories and summaries, chapter records, the continuity warden, the
curator, the judge's after-reply checks, and illustrations.

**Calls, by default:**

| What | How often |
|---|---|
| Story read (memory model) | Every 3 character replies. Scene changes, a story's authored cues, a stuck scene being re-checked, and an edit or swipe can each ask for one sooner. Its findings apply after the next reply finishes. |
| Summaries | Now and then, as memories pile up. |
| Private inner voice | Up to two calls per turn (one more with **Prepare for: two likeliest**). |
| Chapter records | A few calls when a chapter ends, for stories with chapters. |
| Story briefing | One call per new story in a chat, when the story has no briefing of its own. |
| What could I do? and Ask | Only when you use them. |
| Wizard | Only while you use it. |
| Judge | One short call per use that applies, on the judge's provider. |

The read cadence is **Read every … replies** under **Settings → Features → Story reading**; lower reacts sooner and
costs more calls. In a group, one message from you can draw several character replies, and each counts.

## Server plugins

Five server plugins ship in `server-plugin/`: judge and lore, and the optional GPU, media and harness plugins. SillyTavern
loads server plugins only when `config.yaml` has `enableServerPlugins: true`, and only after a restart.

The lore plugin makes the story's lorebook writes conditional: a write is saved only while the book file still holds
what the write started from, so the story never overwrites a change another page already saved. Without it the story
compares with the server just before saving, which narrows that window but cannot close it. SillyTavern's own lorebook
editor saves without that check, so its save landing in the same instant is detected afterwards, not prevented.

- **From a source checkout**: `npm run plugin:install` installs the judge and lore plugins into the SillyTavern folder
  named in `.st-root` (or pass `-- --st-root <path>`), and `-- --with gpu,media,harness` adds the others. A plugin
  already installed is kept in sync. Files are compared by content, never by version, and a local `config.json` is
  never touched; `-- --check` lists the files that differ without writing. It warns when `enableServerPlugins` is off.
- **From a release zip**: copy each plugin folder you want from `story-orchestrator/server-plugin/<name>/` to
  `<SillyTavern>/plugins/<name>/`.

Then restart SillyTavern. Install only the plugins you need. The GPU plugin is for one specific machine setup; see
[One GPU for text and images](gpu-sharing.md).

## Tested on

The extension is exercised against one host at a time; this is the one it was last exercised on. The models are in
[Choosing models](models.md#what-we-tested-on).

| | |
|---|---|
| SillyTavern (live play) | 1.19.0, commit `7c399419636c4df3d6d035fcddf9ccbb8248b432` (`host.commit` in `dist/manifest.json`) |
| SillyTavern (clean install) | 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127` (`release`, cloned clean): machine gates only, no live play |
| Declared older host | 1.18.0 (`minimum_client_version`), commit `51ad27fb86d39a3daca3adaa970375c9670c12df`: typecheck, lint, test, build and release tests green; not played through |
| Browser | Chromium, desktop and a 390×844 phone viewport |
| Node.js | 22.22 with npm 10.9 |

**Not tested on other SillyTavern versions.** The extension imports SillyTavern modules by path and hashes them at
build time, so a version whose files differ is one nobody has run it against. **Settings → Help → Setup → Host
capabilities** reports each feature it probes (`macros`, `slashCommands`, `backgrounds`, `vectors`, `judge`) as present,
absent or error.

---

[Guide](../README.md)
