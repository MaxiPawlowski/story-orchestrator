import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finding, must } from "../../test/findings/ledger";

// S4: the shipped example's cp1 pinned a sampler stack ("Story: Sun Ruins") that degenerated on the
// Artemis model, and a preset cannot reach a chat-completion backend at all. The example must play on
// whatever the player's own preset is; the preset effect is exercised by test/scenarios/effects-preset.*.
finding("S4", () => {
  const story = JSON.parse(readFileSync(join(__dirname, "..", "..", "examples", "sun-ruins", "quest-for-the-sun-ruins.json"), "utf-8")) as { checkpoints: Array<{ id: string; effects?: Record<string, unknown> }> };
  must(story.checkpoints.length > 0, "the example story has no checkpoints, so this check proves nothing");
  const pinned = story.checkpoints.filter((checkpoint) => checkpoint.effects && "preset" in checkpoint.effects).map((checkpoint) => checkpoint.id);
  must(pinned.length === 0, `the shipped example pins a sampler preset at ${pinned.join(", ")}`);
});
