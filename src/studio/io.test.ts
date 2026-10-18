import { isValidationErrorList, type Story } from "@engine/index";
import { canonicalize, exportDraft, importDraft } from "./io";

const story: Story = {
  title: "Roundtrip",
  description: "d",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "r" },
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "r" },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true, state_snapshot: { route: "stealth" } },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }] } }],
  roster: [{ id: "guide", name: "Guide" }],
};

describe("studio io", () => {
  it("exports and re-imports byte-equivalent modulo key order", () => {
    const back = importDraft(exportDraft(story));
    expect(isValidationErrorList(back)).toBe(false);
    expect(canonicalize(back)).toBe(canonicalize(story));
  });

  it("rejects malformed JSON", () => {
    const result = importDraft("{ not json");
    expect(isValidationErrorList(result)).toBe(true);
  });

  it("rejects schema-invalid stories", () => {
    const result = importDraft(JSON.stringify({ title: "x" }));
    expect(isValidationErrorList(result)).toBe(true);
  });
});
