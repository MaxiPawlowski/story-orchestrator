import { parseStory } from "../validate";
import { usesGameLayer } from "./gameLayer";
import { diffStories } from "../storyDiff";

const story = (patch: { backdrop?: unknown; backdrop_defaults?: unknown }) => ({
  title: "T", description: "D", qualities: [],
  ...(patch.backdrop_defaults !== undefined ? { backdrop_defaults: patch.backdrop_defaults } : {}),
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, ...(patch.backdrop !== undefined ? { effects: { backdrop: patch.backdrop } } : {}) }],
  transitions: [], roster: [{ id: "mara", name: "Mara" }],
});

const errors = (json: unknown) => {
  const parsed = parseStory(json);
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

describe("v3.0 45 A: effects.backdrop and backdrop_defaults", () => {
  it("keeps every valid field and folds a plain kind into a layer", () => {
    const parsed = parseStory(story({
      backdrop: { weather: "rain", time: "night", indoor: false, intensity: 0.4, loop: "pre", layers: ["rain", { kind: "fog", intensity: 0.3, speed: 0.5, color: "#AABBCC" }, { kind: "shimmer", mask: "water" }] },
      backdrop_defaults: { layers: [], loop: false },
    }));
    if (Array.isArray(parsed)) throw new Error(JSON.stringify(parsed));
    expect(parsed.checkpoints[0].effects?.backdrop).toEqual({
      weather: "rain", time: "night", indoor: false, intensity: 0.4, loop: "pre",
      layers: [{ kind: "rain" }, { kind: "fog", intensity: 0.3, speed: 0.5, color: "#aabbcc" }, { kind: "shimmer", mask: "water" }],
    });
    expect(parsed.backdrop_defaults).toEqual({ layers: [], loop: false });
  });

  it("either field alone loads the game layer", () => {
    expect(usesGameLayer(story({ backdrop: {} }))).toBe(true);
    expect(usesGameLayer(story({ backdrop_defaults: {} }))).toBe(true);
    expect(usesGameLayer(story({}))).toBe(false);
  });

  it("names each bad field", () => {
    const found = errors(story({
      backdrop: { weather: "hail", time: "noon", indoor: "yes", intensity: 2, loop: "always", layers: ["lava", { kind: "rain", speed: 9, color: "red", mask: "ground", glow: 1 }, "rain"], extra: 1 },
    }));
    const paths = found.map((line) => line.split(":")[0]);
    expect(paths).toEqual(expect.arrayContaining([
      "checkpoints.0.effects.backdrop.weather", "checkpoints.0.effects.backdrop.time", "checkpoints.0.effects.backdrop.indoor",
      "checkpoints.0.effects.backdrop.intensity", "checkpoints.0.effects.backdrop.loop", "checkpoints.0.effects.backdrop.layers.0",
      "checkpoints.0.effects.backdrop.layers.1.speed", "checkpoints.0.effects.backdrop.layers.1.color", "checkpoints.0.effects.backdrop.layers.1.mask",
      "checkpoints.0.effects.backdrop.layers.1.glow", "checkpoints.0.effects.backdrop.layers.2.kind", "checkpoints.0.effects.backdrop.extra",
    ]));
    expect(errors(story({ backdrop_defaults: { layers: "rain" } }))).toEqual([expect.stringMatching(/^backdrop_defaults\.layers: /)]);
    expect(errors(story({ backdrop: "rain" }))).toEqual([expect.stringMatching(/^checkpoints\.0\.effects\.backdrop: /)]);
  });

  it("a changed default is a compatible story change", () => {
    const before = parseStory(story({ backdrop_defaults: { weather: "clear" } }));
    const after = parseStory(story({ backdrop_defaults: { weather: "snow" } }));
    if (Array.isArray(before) || Array.isArray(after)) throw new Error("parse");
    const diff = diffStories(before, after, null);
    expect(diff.entries.map((entry) => entry.code)).toContain("backdrop-defaults-changed");
    expect(diff.classification).toBe("compatible");
  });
});
