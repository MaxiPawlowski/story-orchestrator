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

It carries an authored identity (`"id": "sun-ruins"`, `"version": 1`) and typed `requirements`, so a
chat pins the copy it plays: editing or deleting the library record never disturbs a running game.

### Setup

1. Select a Connection Manager memory profile under **Memory LLM profile** in the Story Orchestrator
   settings panel. It is install-wide — every chat, including new ones, inherits it, and extraction is
   on by default.
2. Paste the contents of `quest-for-the-sun-ruins.json` into **Import format-2 JSON** and click
   **Import and Load**.
3. Give the story what it requires:
   - **By hand** — import the four character cards (**Characters → Import**), create a **group chat**
     containing `DM Narrator`, `Arin`, `Ponticius` and `Luke`, and import `Xentar Checkpoints.json` as
     a lorebook (the story requires one named **Xentar Checkpoints**).
   - **Or let the wizard do it** — turn on **Author view** in the drawer and press **Fix with wizard**
     on the unmet-requirements panel: it proposes each missing card, lorebook and group as its own
     card, creates only what you accept, and never touches an asset that already exists.
4. Open the group chat and play. The drawer opens on the player view — where you are, what happened
   recently, open threads, what the story has established, and whether the extension is reading,
   working, waiting or stuck. Turn on **Author view** for the blackboard, convergence bars, scheduler
   and the exact injected payload.

The requirements dots turn green once the group members and the lorebook are present. Anchors — job
board, mission, departure, artifact, guild return — are reached on every path; the Luke branch and the
riddle outcome vary the route between them.

### What this example deliberately leaves out

Stagecraft is demonstrated elsewhere: `test/journeys/j8-stagecraft.story.json` is the smallest story
that shows both halves — an `effects.background` switch on a checkpoint (deterministic) and a
`stagecraft.lorebooks` allowlist that bounds what the World Info curator may ever rewrite (the curator
is off by default; turn it on under **Stagecraft** in the settings panel).
