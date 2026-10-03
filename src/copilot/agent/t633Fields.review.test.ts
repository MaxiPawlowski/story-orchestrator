import type { StoryV2 } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { missingAtDone } from "./finish";
import { approvePlan, executeReply, newAgentSession, NO_CHANGE, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import { checkToolCall } from "./tools";
import type { AgentSession } from "./types";

const AT = "2026-10-02T21:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const map = (): StoryV2 => ({
  format: 2,
  title: "The Red Ink",
  description: "",
  qualities: [{ key: "pen_control", type: "enum", source: "extractor", rubric: "Who holds the pen?", values: ["house_held", "contested", "apprentice_held"] }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true },
    { id: "raid", name: "Raid", objective: "Hold.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "raid", priority: 1, gate: { q: "pen_control", op: "==", v: "contested" } }],
  roster: [{ id: "master", name: "Master" }],
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("map", "review", {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT);
const run = (tool: string, args: Record<string, unknown>) =>
  executeReply(running(), { kind: "call", call: { tool, args } }, agentContext(map(), emptyEnvironment()), META).session.steps.at(-1);

describe("T6-3-3 MEDIUM: updateQuality reads every documented quality field", () => {
  it("keeps evidence_from, player_labels and roll in the patch", () => {
    const check = checkToolCall({ tool: "updateQuality", args: { key: "pen_control", patch: { evidence_from: "world", player_labels: { house_held: "the house has it" } } } });
    expect(check.ok && check.op).toEqual({ kind: "updateQuality", key: "pen_control", patch: { evidence_from: "world", player_labels: { house_held: "the house has it" } } });
    const roll = checkToolCall({ tool: "updateQuality", args: { key: "ambush", patch: { roll: { sides: 6, target: 2 } } } });
    expect(roll.ok && roll.op).toEqual({ kind: "updateQuality", key: "ambush", patch: { roll: { sides: 6, target: 2 } } });
  });

  it("applies the evidence_from step the diagnostic asks for instead of calling it no change", () => {
    const step = run("updateQuality", { key: "pen_control", patch: { evidence_from: "world" } });
    expect(step?.status).toBe("pending");
    expect(step?.observation).not.toContain(NO_CHANGE);
  });

  it("refuses an unknown or invalid quality field with the field it meant", () => {
    const typo = checkToolCall({ tool: "updateQuality", args: { key: "pen_control", patch: { evidence_form: "world" } } });
    expect(typo.ok).toBe(false);
    expect(!typo.ok && typo.message).toContain('did you mean "evidence_from"');
    const bad = checkToolCall({ tool: "updateQuality", args: { key: "pen_control", patch: { evidence_from: "witness" } } });
    expect(!bad.ok && bad.message).toContain("any, world or party");
  });
});

describe("T6-3-3 MEDIUM: setRequirements refuses a field it does not have", () => {
  it("names groups as unknown and says where a cast belongs", () => {
    const check = checkToolCall({ tool: "setRequirements", args: { requirements: { members: ["Master"], groups: ["The Cast"] } } });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.message).toContain('"groups"');
    expect(!check.ok && check.message).toContain("members");
  });

  it("refuses a typo with did-you-mean", () => {
    const check = checkToolCall({ tool: "setRequirements", args: { requirements: { lorebook: ["Lore"] } } });
    expect(!check.ok && check.message).toContain('did you mean "lorebooks"');
  });
});

describe("T6-3-3 HIGH: the done check names a checkpoint the story passes straight through", () => {
  it("lists the pass-through exit so the first done is refused with it, and the summary keeps it", () => {
    const draft = map();
    draft.checkpoints = [...draft.checkpoints, { id: "choice", name: "Choice", objective: "Choose.", type: "anchor" }];
    draft.transitions = [...draft.transitions, { from: "raid", to: "choice", priority: 1, gate: { q: "pen_control", op: "in", v: ["contested", "apprentice_held"] } }];
    const missing = missingAtDone(running(), draft, { ...emptyEnvironment(), groupNames: [draft.title] });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("'raid' is passed straight through");
    expect(missing[0]).toContain("gate-open-on-arrival at transitions.1.gate");
    expect(missingAtDone(running(), map(), { ...emptyEnvironment(), groupNames: [map().title] })).toEqual([]);
    expect(missingAtDone(running(), map(), emptyEnvironment())).toEqual(["no group for the cast (createGroup with every card)"]);
  });
});

describe("v2.7 plan 03 (D5): every story needs its group", () => {
  it("a one-member story built only from cards that already exist still needs a group; an existing group named for it satisfies it", () => {
    expect(map().roster).toHaveLength(1);
    expect(missingAtDone(running(), map(), emptyEnvironment())).toContain("no group for the cast (createGroup with every card)");
    expect(missingAtDone(running(), map(), { ...emptyEnvironment(), groupNames: [map().title] })).toEqual([]);
  });
});
