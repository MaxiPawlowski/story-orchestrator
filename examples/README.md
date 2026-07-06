# Example stories

Polished, ready-to-run format-2 stories for Story Orchestrator v2.

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

### Setup

1. Import the four character cards (**Characters → Import**) and create a **group chat** named
   however you like containing `DM Narrator`, `Arin`, `Ponticius`, and `Luke`.
2. Import `Xentar Checkpoints.json` as a World Info / lorebook entry set. The story requires a
   lorebook named **Xentar Checkpoints**.
3. In the Story Orchestrator settings panel, paste the contents of
   `quest-for-the-sun-ruins.json` into **Import format-2 JSON** and click **Import and Load**.
4. Select a Connection Manager memory profile under **Memory LLM profile** so extraction can run.
5. Open the group chat and play. The drawer shows the active checkpoint, blackboard, and
   convergence progress; checkpoints advance as the memory model extracts the gated qualities.

The requirements dots in the drawer turn green once the group members and the lorebook are
present. Anchors — job board, mission, departure, artifact, guild return — are reached on every
path; the Luke branch and the riddle outcome vary the route between them.
