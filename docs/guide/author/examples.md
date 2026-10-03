# Examples

## Quest for the Sun Ruins

`examples/sun-ruins/` is a complete, playable story that ships with the extension. It uses most of the format:
latching and enum qualities, typed gates with cues, a branch (bring Luke or not) that rejoins, a riddle sub-branch,
checkpoint effects (author's note, lore, cast changes, scripted lines, a preset), convergence toward the finale and
thread bridges.

Files:

- `quest-for-the-sun-ruins.json`: the story. Import this.
- `Xentar Checkpoints.json`: the lorebook its scenes switch on.
- `Arin.png`, `DM Narrator.png`, `Luke.png`, `Ponticius.png`: the four character cards.

To play it:

1. Choose a memory model ([Memory model](../setup/memory-model.md)).
2. **Start → Import a story** and paste or load `quest-for-the-sun-ruins.json`.
3. Import the four cards, make a group chat with all four, and import the lorebook. Or turn on Author view and press
   **Fix with wizard**: it proposes each missing card, the lorebook and the group, and creates only what you accept.
4. Open the group chat and play. The drawer's requirement dots turn green once everything is present.

Read the JSON next to [the fields](README.md) to see each topic used in a real
story. `examples/README.md` has more detail.

---

[Author's guide](README.md)
