# Example stories

Polished, ready-to-run format-2 stories for Story Orchestrator.

## Quest for the Sun Ruins (`sun-ruins/`)

A branching adventure that exercises the full v2 spine: latching and enum qualities, typed
gates (with `extractor_trigger` cues), a two-way branch (bring Luke or not) that reconverges,
a sphinx-riddle sub-branch, checkpoint effects (author's note, world info, `cast_changes`,
`npc_replies`, a preset override), convergence progress toward the finale anchor, arc bridges,
and a group roster.

Files:

- `quest-for-the-sun-ruins.json` — the story (import this).
- `Xentar Checkpoints.json` — the World Info / lorebook the story's `world_info` effects toggle.
- `Arin.png`, `DM Narrator.png`, `Luke.png`, `Ponticius.png` — the four roster character cards.

It carries an authored identity (`"id": "sun-ruins"`) and typed `requirements`, so a chat pins the copy it
plays: editing or deleting the library record never disturbs a running game.

### Setup

Follow the guide's [Quick start](../docs/guide/quick-start.md): choose a memory model, import the four cards and the
lorebook, make a group with all four characters, then **Start → Import a story** in that group chat. Instead of
importing the cards by hand, **Fix with wizard** (Author view, the requirements panel) can propose each missing card,
the lorebook and the group, and creates only what you accept.

Anchors (job board, mission, departure, artifact, guild return) are reached on every path; the Luke branch and the
riddle outcome vary the route between them.

### What this example deliberately leaves out

Stagecraft is demonstrated elsewhere: `test/journeys/j8-stagecraft.story.json` is the smallest story
that shows both halves — an `effects.background` switch on a checkpoint (deterministic) and a
`stagecraft.lorebooks` allowlist that bounds what the World Info curator may ever rewrite (the curator
is on by default in review mode, under **Stagecraft** in the settings panel).
