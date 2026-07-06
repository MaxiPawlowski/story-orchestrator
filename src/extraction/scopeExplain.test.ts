import { parseStoryV2OrThrow, type BlackboardSnapshot } from "@engine/index";
import { deriveScope, deriveScopeExplained } from "./scope";

const EMPTY: BlackboardSnapshot = { values: {}, versions: {}, latched: {} };

const story = parseStoryV2OrThrow({
  format: 2,
  title: "Ruins",
  description: "",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "r" },
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "r" },
    { key: "alarm", type: "bool", source: "extractor", rubric: "r" },
  ],
  checkpoints: [
    { id: "start", name: "Approach", objective: "", type: "intermediate", start: true },
    { id: "infiltrate", name: "Infiltrate", objective: "", type: "intermediate", state_snapshot: { route: "stealth" } },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "infiltrate", priority: 0, gate: { all: [{ q: "route", op: "in", v: ["stealth", "force"] }] }, extraction_hint: "how they enter" },
    { from: "infiltrate", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }, { not: { q: "alarm", op: "==", v: true } }] } },
  ],
  roster: [],
});

describe("deriveScopeExplained", () => {
  ["start", "infiltrate", "cache"].forEach((checkpointId) => {
    it(`matches deriveScope keys for ${checkpointId}`, () => {
      const explained = deriveScopeExplained(story, checkpointId, EMPTY);
      const plain = deriveScope(story, checkpointId, EMPTY);
      expect(explained.map((entry) => entry.key)).toEqual(plain.map((entry) => entry.key));
    });
    it(`explains every in-scope quality for ${checkpointId}`, () => {
      deriveScopeExplained(story, checkpointId, EMPTY).forEach((entry) => {
        expect(entry.pulledBy.length).toBeGreaterThan(0);
      });
    });
  });

  it("attributes a gate pull and carries its hint", () => {
    const scope = deriveScopeExplained(story, "start", EMPTY);
    const route = scope.find((entry) => entry.key === "route");
    expect(route?.pulledBy.some((pull) => pull.kind === "gate")).toBe(true);
    expect(route?.hints).toContain("how they enter");
  });
});
