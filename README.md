# Story Orchestrator

A SillyTavern extension that plays **authored stories** over a chat. A story is a graph of scenes (checkpoints) with
exits that open on what the chat actually shows. A second model reads each reply off the response path, tracks the
story's facts and memory, and the extension steers the cast, the lore and the pacing toward the next scene. Swipes,
edits and deletions roll the story back with the chat. You play by chatting, as always.

**Guide:** [docs/guide](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/README.md) ·
[Player](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/player/README.md) ·
[Setup](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/setup/README.md) ·
[Author](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/author/README.md) ·
[Troubleshooting](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/player/troubleshooting.md) ·
[Contributing](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/dev/contributing.md)

## Install

- **Release zip:** unzip `story-orchestrator-<version>.zip` so its `story-orchestrator/` folder lands at
  `<SillyTavern>/public/scripts/extensions/third-party/story-orchestrator`, then reload SillyTavern. The zip already
  holds the built extension.
- **Source:** clone anywhere outside SillyTavern, write your SillyTavern root into a `.st-root` file (or set
  `ST_ROOT`; the build hashes SillyTavern's files), then `npm ci && npm run build && npm run stage`. `dist/` is not in
  the repository, so the build is required.

The panel appears under **Extensions → Story Orchestrator**.

| Tested on | |
|---|---|
| SillyTavern (live play) | 1.19.0 |
| Declared older host | 1.18.0 (`minimum_client_version`): machine gates only, not played through |

Other versions are untested; details in the
[guide](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/README.md#tested-on). Optional server plugins (judge, harness, GPU, media) are installed separately:
[Setup](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/setup/README.md#server-plugins).

### Companion server plugins

Their source, tests and READMEs live in [`server-plugin/`](server-plugin/) in this repository. The release zip
includes their runtime source. They run inside SillyTavern's Node server; the browser extension calls their
`/api/plugins/story-orchestrator-*` routes.

| Plugin | Provides |
|---|---|
| [Judge](server-plugin/story-orchestrator-judge/README.md) | Server-side judgment-provider requests and credentials. |
| [Harness](server-plugin/story-orchestrator-harness/README.md) | Model tasks through coding-agent CLIs and the wizard's opencode tool bridge. |
| [GPU](server-plugin/story-orchestrator-gpu/README.md) | Coordination of local text generation and ComfyUI sharing a GPU. |
| [Media](server-plugin/story-orchestrator-media/README.md) | Owned ComfyUI jobs, reference edits, model fingerprints and generated sprite files. |

From a source checkout, `npm run plugin:install` installs judge. Add `-- --with gpu,media,harness` to install all
four. Use `npm run plugin:install -- --with gpu,media,harness --check` to compare installed runtime files with this
checkout, including changes within the same version. Installation preserves local `config.json` files.
Set `enableServerPlugins: true` in SillyTavern's `config.yaml`, and restart SillyTavern after installing or updating.
From a release zip, copy the chosen companion folders from `server-plugin/` into `<SillyTavern>/plugins/`.

## Quick start

1. **Memory model.** Make a Connection Manager profile (with the model's instruct template), pick it as the
   **Memory model profile** under **Memory**, and press **Test memory model**. It is install-wide.
2. **A story.** **Start → Import a story** and load `examples/sun-ruins/quest-for-the-sun-ruins.json` (it needs the
   four cards, the group and the lorebook in that folder; **Fix with wizard** can create them), or turn on the wizard
   under **Authoring** and use **New story (wizard)**.
3. **Play** in the story's group chat. The story bar above the chat box opens the drawer: where you are, what
   happened, what is open. **Repair** names anything missing.

## Features

| Area | Feature | In one line |
|---|---|---|
| Playing | Stories and checkpoints | Scenes open in order when the chat shows what their exits ask for; one change per turn. |
| Playing | Drawer, story bar, notes under messages | Where you are, what happened, what is open; spoiler-free in player mode. |
| Playing | Rollback, branches, restart | Swipe/edit/delete step the story back; a branch continues on request; restart is the one reset. |
| Playing | Recap and `/story` | Welcome-back recap, threads, chapters and the chronicle. |
| Memory | Off-path reads | A memory model reads after each reply; findings apply at the next turn. |
| Memory | Memory tiers, canon, chapters | Facts, session details, short-term and scene history; chapter summaries fold older memory. |
| Characters | Speaker direction | Picks who speaks next in a group from the scene's rules. |
| Characters | Private knowledge | Each character's secrets reach only that character's replies. |
| Characters | Motives and inner voice | Per-character aims steer replies without narrating for the player (inner voice off by default). |
| World | Story lore | A story's lorebooks switch on only in its own chats, scene by scene. |
| World | World Info curator | Proposes lorebook updates inside the story's declared books; you review them. |
| Images | Backgrounds, illustrations, sprites | Checkpoint backgrounds; ComfyUI illustrations; the sprite stage (optional). |
| Judge | Judgment model (optional) | Fast picks for speakers, lore, memory checks and scene tracking; never blocks. |
| Authoring | Checkpoint Studio | Visual editor with consequence-first diagnostics and safe saves. |
| Authoring | Setup wizard and story agent | Premise to playable story; creates cards, lorebook and group only with your OK. |
| Setup | Repair and Host capabilities | Names the one missing step; reports what SillyTavern features were found. |

## Illustrations and scope

Images are optional and need your own ComfyUI and an image-prompt profile (**Images → Image service**). Install
settings decide whether automation is allowed; a story can ask for art at its own moments; each chat can pause it or
draw on demand from **Overview → Illustrations**. Change the default image models to ones your ComfyUI has. The GPU
plugin is optional; configure its adapter when local text and image models need to share one GPU.
[More](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/setup/images.md)

## Judge recommended configuration

The judge (TypeSafe's Jev, behind the optional `story-orchestrator-judge` server plugin) ships with **every use on
except House rules**, and sends nothing until a TypeSafe key is configured. Each use lists what it sends in its
tooltip. Measured on `jev-1.13.0`; on another model the panel marks a use as unproven. The use table, privacy and
measurements: [Judge](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/setup/judge.md).

## Macros and commands

`{{story_*}}` macros (title, checkpoint, tension, scene location/time/present, `story_quality_<key>`, memory tiers,
chapters, …), `/story`, `/so-mem` and the author's `/cp`:
[Macros and slash commands](https://github.com/MaxiPawlowski/story-orchestrator/blob/master/docs/guide/author/macros-and-commands.md).

## Provenance & licensing

Story Orchestrator is **AGPL-3.0** (see [`LICENSE`](LICENSE)); distributing it requires making source available
under the same terms.

- The memory subsystem is a vendored TypeScript adaptation of
  [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0).
- The copilot's proposal/diff-review pattern comes from [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT).
- The state-memo and delta-log/rollback patterns come from
  [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT).
- The extraction stability lag and manual memory controls follow
  [SillyTavern-MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize) (AGPL-3.0 — patterns only,
  no code vendored).
