import type { StoryV2 } from "@engine/index";
import { runDiagnostics, type DiagnosticsContext } from "./diagnostics";

const story = (stage: unknown): StoryV2 => ({
  format: 2,
  title: "Stage test",
  description: "",
  qualities: [],
  checkpoints: [
    { id: "start", name: "Arrival", objective: "", type: "intermediate", start: true, effects: { stage } as StoryV2["checkpoints"][number]["effects"] },
    { id: "end", name: "Leaving", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { all: [] } }],
  roster: [{ id: "a1", name: "Arin" }, { id: "bea", name: "Bea" }],
});

const installed: DiagnosticsContext = { spriteInventory: () => ({ arin: { sets: ["default", "rain"], faces: ["happy", "neutral"] } }) };

const rows = (draft: StoryV2, context: DiagnosticsContext = installed) => runDiagnostics(draft, context).filter((entry) => entry.code === "stage-sprite-unknown");

describe("Studio: a stage direction names a set or face the installed sprites lack", () => {
  it("warns for an unknown set and an unknown face, by card name or cast id, and states the consequence", () => {
    const found = rows(story({ cast: { Arin: { set: "snow" }, a1: { face: "angry" } } }));
    expect(found.map((row) => row.message)).toEqual([
      "'arin' has no sprite set 'snow' installed; installed sets: default, rain",
      "'a1' has no 'angry' sprite installed; installed faces: happy, neutral",
    ]);
    expect(found[0]).toMatchObject({ severity: "warning", path: "checkpoints.0.effects.stage.cast", consequence: expect.stringContaining("keep the sprite they had") });
  });

  it("control: installed sets and faces, a member the stage has not loaded, and no inventory raise nothing", () => {
    expect(rows(story({ cast: { arin: { set: "rain", face: "happy" } } }))).toEqual([]);
    expect(rows(story({ cast: { Bea: { face: "angry" } } }))).toEqual([]);
    expect(rows(story({ cast: { Arin: { face: "angry" } } }), {})).toEqual([]);
  });
});
