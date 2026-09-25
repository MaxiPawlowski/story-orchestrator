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

  it("reads the objective_block switch through setStoryField, and refuses any other value (v2.4 plan 06 T16a)", () => {
    const ok = parseProposal(JSON.stringify({ summary: "s", ops: [{ kind: "setStoryField", field: "objective_block", value: "off" }] }));
    expect(ok.issues).toEqual([]);
    expect(ok.proposal.ops).toEqual([{ kind: "setStoryField", field: "objective_block", value: "off" }]);
    expect(parseProposal(JSON.stringify({ summary: "s", ops: [{ kind: "setStoryField", field: "objective_block", value: "sometimes" }] })).issues[0]).toContain('objective_block must be "auto" or "off"');
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

  it("carries a quality's read_as and its criteria, and drops criteria without a hint (v2.2 plan 06)", () => {
    const { proposal } = parseProposal(JSON.stringify({ summary: "q", ops: [
      { kind: "addQuality", quality: { key: "door", type: "bool", source: "extractor", rubric: "Is the door open?", read_as: "choice", criteria: { true: "It stands open" } } },
      { kind: "addQuality", quality: { key: "coin", type: "int", source: "extractor", rubric: "Coins?", criteria: { a: "x" } } },
      { kind: "updateQuality", key: "coin", patch: { read_as: "stated" } },
    ] }));
    expect(proposal.ops).toEqual([
      { kind: "addQuality", quality: { key: "door", type: "bool", source: "extractor", rubric: "Is the door open?", read_as: "choice", criteria: { true: "It stands open" } } },
      { kind: "addQuality", quality: { key: "coin", type: "int", source: "extractor", rubric: "Coins?" } },
      { kind: "updateQuality", key: "coin", patch: { read_as: "stated" } },
    ]);
  });

  it("reads a lore_select op in either spelling (v2.2 plan 04)", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({ summary: "lore", ops: [{ kind: "setLoreSelect", loreSelect: { lorebooks: ["Vault Lore"], top_k: 5 } }, { kind: "setLoreSelect", lore_select: { lorebooks: ["Other"] } }] }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([{ kind: "setLoreSelect", loreSelect: { lorebooks: ["Vault Lore"], top_k: 5 } }, { kind: "setLoreSelect", loreSelect: { lorebooks: ["Other"] } }]);
  });

  it("reads a scene_read op in either spelling, keeping only an explicit inject: false (v2.2 plan 03)", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "places",
      ops: [
        { kind: "setSceneRead", sceneRead: { locations: ["guild hall", "desert road"], inject: true } },
        { kind: "setSceneRead", scene_read: { times: ["day", "night"], inject: false } },
      ],
    }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([
      { kind: "setSceneRead", sceneRead: { locations: ["guild hall", "desert road"], times: [] } },
      { kind: "setSceneRead", sceneRead: { locations: [], times: ["day", "night"], inject: false } },
    ]);
  });

  it("carries a trimmed roster role on add and update, and clears it with an empty one (v2.2 plan 01)", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "cast",
      ops: [
        { kind: "addRosterMember", member: { id: "arin", name: "Arin", role: "  Max's partner  " } },
        { kind: "addRosterMember", member: { id: "luke", name: "Luke", role: "   " } },
        { kind: "updateRosterMember", id: "arin", patch: { role: "the guide" } },
        { kind: "updateRosterMember", id: "luke", patch: { role: "" } },
      ],
    }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([
      { kind: "addRosterMember", member: { id: "arin", name: "Arin", role: "Max's partner" } },
      { kind: "addRosterMember", member: { id: "luke", name: "Luke" } },
      { kind: "updateRosterMember", id: "arin", patch: { role: "the guide" } },
      { kind: "updateRosterMember", id: "luke", patch: { role: undefined } },
    ]);
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
        { kind: "setRequirements", requirements: { members: ["Arin "], lorebooks: ["Xentar"], personas: [" "] } },
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

  it("reads the interview variant as questions, not as a malformed proposal", () => {
    const { proposal, issues, questions } = parseProposal(JSON.stringify({
      summary: "Two things would change the shape of this.",
      questions: [
        { id: "antagonist", text: "Who opposes the party?", why: "it decides the mid-story gates", options: ["a rival", "the ruins themselves"] },
        "How does it end?",
      ],
    }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([]);
    expect(questions).toEqual([
      { id: "antagonist", text: "Who opposes the party?", why: "it decides the mid-story gates", options: ["a rival", "the ruins themselves"] },
      { id: "q2", text: "How does it end?" },
    ]);
  });

  it("caps the interview at three questions and drops empty ones", () => {
    const { questions } = parseProposal(JSON.stringify({ questions: ["a", "b", "c", "d", "   "] }));
    expect(questions.map((question) => question.text)).toEqual(["a", "b", "c"]);
  });

  it("prefers ops over questions when the model sends both", () => {
    const { proposal, questions } = parseProposal(JSON.stringify({
      questions: ["Should I really?"],
      ops: [{ kind: "addQuality", quality: { key: "trust", type: "bool", source: "extractor", rubric: "Does the guide trust the party?" } }],
    }));
    expect(proposal.ops).toHaveLength(1);
    expect(questions).toEqual([]);
  });

  it("parses every provisioning op kind", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "provision the install",
      ops: [
        { kind: "createCharacterCard", name: "Arin", description: "A guide.", first_mes: "You came.", tags: "guide, sun-ruins" },
        { kind: "createStoryLorebook", name: "Sun Ruins Lore" },
        { kind: "upsertLorebookEntry", lorebook: "Sun Ruins Lore", comment: "The ruins", keys: ["ruins", "sun"], content: "Sunken halls.", constant: true },
        { kind: "createGroup", name: "Sun Ruins Party", members: ["Arin"] },
      ],
    }));
    expect(issues).toEqual([]);
    expect(proposal.ops).toEqual([
      { kind: "createCharacterCard", name: "Arin", description: "A guide.", first_mes: "You came.", tags: ["guide", "sun-ruins"] },
      { kind: "createStoryLorebook", name: "Sun Ruins Lore" },
      { kind: "upsertLorebookEntry", lorebook: "Sun Ruins Lore", comment: "The ruins", content: "Sunken halls.", keys: ["ruins", "sun"], constant: true },
      { kind: "createGroup", name: "Sun Ruins Party", members: ["Arin"] },
    ]);
  });

  it("rejects provisioning ops missing what the host needs", () => {
    const { proposal, issues } = parseProposal(JSON.stringify({
      summary: "",
      ops: [
        { kind: "createCharacterCard", name: "Arin" },
        { kind: "createGroup", name: "Party", members: [] },
      ],
    }));
    expect(proposal.ops).toEqual([]);
    expect(issues.some((issue) => issue.includes("ops.0.description"))).toBe(true);
    expect(issues.some((issue) => issue.includes("ops.1.members"))).toBe(true);
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
