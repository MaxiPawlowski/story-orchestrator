# Setup

Only one thing is required: a **memory model**. Everything else is optional and off, or harmless, without it.

| Piece | Needed for | Page |
|---|---|---|
| Memory model (a Connection Manager profile) | The story moving on its own, memory, summaries | [Memory model](memory-model.md) |
| Judge plugin + a TypeSafe key | Faster and more careful choices: speaker picks, lore selection, memory checks, scene tracking | [Judge](judge.md) |
| ComfyUI | Illustrations | [Images and the GPU plugin](images.md) |
| Harness plugin | Running tasks through Claude Code, Codex or opencode logins on the server | [Harness](harness.md) |

Every setting is in **Extensions → Story Orchestrator**, below **Start / Continue / Repair / Author**, in one section
per area (the same areas as the README's feature table). Each section's **?** opens its page in this guide, and
rarely changed settings sit under its **Advanced** fold. The panel remembers which sections you left open.

- **Playing**: which story this chat plays, the story bar, notes under messages, the briefing, list marks, pacing.
- **Memory**: the memory model, its fallback, reply thinking, the memory model test, models per task, chapters, the
  continuity warden (Author view).
- **Characters**: several voices per turn.
- **World**: how story lorebooks switch on, and the lorebook curator (Author view, or before a story is loaded).
- **Images**: illustrations and the sprite stage.
- **Judge**: the key, the switch, and what it is used for.
- **Authoring**: the wizard switch (Author view, or before a story is loaded).
- **Setup**: **Host capabilities** says which SillyTavern features the extension found, and **Copy for a bug
  report** copies the whole picture.

Each group says its scope in its title: "this install" settings affect every chat, "this chat" only the open one.

A reference of every setting: [Settings reference](settings-reference.md).

## Server plugins

Three optional server plugins ship in `server-plugin/`. SillyTavern loads server plugins only when `config.yaml` has
`enableServerPlugins: true`, and only after a restart.

- **From the release zip**: copy each plugin folder you want from `story-orchestrator/server-plugin/<name>/` to
  `<SillyTavern>/plugins/<name>/`, set `enableServerPlugins: true`, restart SillyTavern.
- **From a source checkout**: `npm run plugin:install -- --st-root <SillyTavern>` copies all three (it refuses to
  downgrade a newer installed copy without `--force`; `--check` only reports). It warns when `enableServerPlugins` is
  off.

Install only the plugins you need. In particular the GPU plugin is for one specific machine setup; see
[Images and the GPU plugin](images.md).

---

[Guide](../README.md)
