import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProposal, parseSuggestions } from "./parse";

const readGolden = (name: string): string => readFileSync(join(process.cwd(), "test/goldens", name), "utf8");

describe("parseProposal", () => {
  it("parses a valid qualities proposal", () => {
    const { proposal, issues } = parseProposal(readGolden("copilot-qualities.response.txt"));
    expect(issues).toEqual([]);
    expect(proposal.ops).toHaveLength(2);
    expect(proposal.ops[0]).toEqual({ kind: "addQuality", quality: { key: "alarm_tripped", type: "bool", source: "extractor", rubric: "Has the alarm been tripped?" } });
    expect(proposal.summary).toContain("qualities");
  });

  it("strips a ```json fence before parsing", () => {
    const { proposal, issues } = parseProposal(readGolden("copilot-checkpoints.response.txt"));
    expect(issues).toEqual([]);
    expect(proposal.ops.map((op) => op.kind)).toEqual(["addCheckpoint", "updateCheckpoint"]);
  });

  it("keeps structurally valid ops and rejects unknown kinds", () => {
    const { proposal, issues } = parseProposal(readGolden("copilot-invalid.response.txt"));
    expect(proposal.ops).toHaveLength(1);
    expect(proposal.ops[0].kind).toBe("addTransition");
    expect(issues.some((issue) => issue.includes("frobnicate"))).toBe(true);
  });

  it("reports invalid JSON as an issue without throwing", () => {
    const { proposal, issues } = parseProposal("not json at all");
    expect(proposal.ops).toEqual([]);
    expect(issues).toHaveLength(1);
  });

  it("flags a gate leaf with an invalid operator", () => {
    const { issues } = parseProposal(JSON.stringify({ summary: "", ops: [{ kind: "setTransitionGate", ref: { from: "a", to: "b" }, gate: { q: "x", op: "~=", v: 1 } }] }));
    expect(issues.some((issue) => issue.includes("op: invalid operator"))).toBe(true);
  });

  it("parses the story-level ops the wizard needs (plan 05 parity)", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "wire the story up",
      ops: [
        { kind: "setArcTemplate", template: "rising" },
        { kind: "setArcBridges", bridges: [{ arcMatch: "the relic", anchor: "cache", amount: 1 }] },
        { kind: "setRequirements", requirements: { members: ["Arin"], lorebooks: ["Xentar"], personas: [] } },
      ],
    }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([
      { kind: "setArcTemplate", template: "rising" },
      { kind: "setArcBridges", bridges: [{ arcMatch: "the relic", anchor: "cache", amount: 1 }] },
      { kind: "setRequirements", requirements: { members: ["Arin"], lorebooks: ["Xentar"] } },
    ]);
  });

  it("rejects a malformed arc template and a bridge missing its anchor", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "",
      ops: [
        { kind: "setArcTemplate", template: "spiral" },
        { kind: "setArcBridges", bridges: [{ arcMatch: "x" }] },
      ],
    }));
    expect(proposal.ops).toEqual([{ kind: "setArcBridges", bridges: [] }]);
    expect(issues.some((issue) => issue.includes("ops.0.template"))).toBe(true);
    expect(issues.some((issue) => issue.includes("ops.1.bridges.0"))).toBe(true);
  });

  it("clears the dramatic shape with an explicit null", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({ summary: "", ops: [{ kind: "setArcTemplate", template: null }] }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([{ kind: "setArcTemplate", template: null }]);
  });

  it("requires ops to be an array", () => {
    const { issues } = parseProposal(JSON.stringify({ summary: "hi" }));
    expect(issues).toContain("ops: required array");
  });
});

describe("parseSuggestions", () => {
  it("reads a suggestions object", () => {
    expect(parseSuggestions(JSON.stringify({ suggestions: [{ title: "Confront the guard", rationale: "alarm_tripped is true" }] }))).toEqual([
      { title: "Confront the guard", rationale: "alarm_tripped is true" },
    ]);
  });

  it("reads a bare array and defaults missing rationale", () => {
    expect(parseSuggestions(JSON.stringify([{ title: "Slip away" }]))).toEqual([{ title: "Slip away", rationale: "" }]);
  });

  it("returns empty on invalid JSON", () => {
    expect(parseSuggestions("garbage")).toEqual([]);
  });
});
