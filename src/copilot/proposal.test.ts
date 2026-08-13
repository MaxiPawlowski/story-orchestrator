import type { StoryV2 } from "@engine/index";
import { applyOp, applyOps, describeOp, diffProposal, isProvisioningOp, provisioningFollowUpOps, resolveTransitionRef } from "./proposal";
import type { ProposalOp } from "./types";

const baseDraft = (): StoryV2 => ({
  format: 2,
  title: "The Vault Job",
  description: "A heist.",
  qualities: [{ key: "has_key", type: "bool", source: "extractor", rubric: "Does the crew have the vault key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Case the vault.", type: "anchor", start: true },
    { id: "vault", name: "Vault", objective: "Open the vault.", type: "anchor" },
  ],
  transitions: [],
  roster: [],
});

describe("applyOp", () => {
  it("adds a quality", () => {
    const next = applyOp(baseDraft(), { kind: "addQuality", quality: { key: "loot", type: "int", source: "extractor", rubric: "How much loot?" } });
    expect(next.qualities.map((quality) => quality.key)).toEqual(["has_key", "loot"]);
  });

  it("updates a checkpoint by id", () => {
    const next = applyOp(baseDraft(), { kind: "updateCheckpoint", id: "vault", patch: { convergence_threshold: 2 } });
    expect(next.checkpoints.find((checkpoint) => checkpoint.id === "vault")?.convergence_threshold).toBe(2);
  });

  it("sets the story-level fields the Studio now edits", () => {
    const next = applyOps(baseDraft(), [
      { kind: "setArcTemplate", template: "three_act" },
      { kind: "setRequirements", requirements: { members: ["Arin"], personas: [] } },
      { kind: "setArcBridges", bridges: [{ arcMatch: "the key", anchor: "vault", amount: 1 }] },
    ]);
    expect(next.arc_template).toBe("three_act");
    expect(next.requirements).toEqual({ members: ["Arin"] });
    expect(next.arc_bridges).toEqual([{ arcMatch: "the key", anchor: "vault", amount: 1 }]);
    const cleared = applyOps(next, [{ kind: "setArcTemplate", template: null }, { kind: "setArcBridges", bridges: [] }]);
    expect(cleared.arc_template).toBeUndefined();
    expect(cleared.arc_bridges).toBeUndefined();
  });

  it("does not mutate the input draft", () => {
    const draft = baseDraft();
    applyOp(draft, { kind: "addQuality", quality: { key: "loot", type: "int", source: "extractor", rubric: "?" } });
    expect(draft.qualities).toHaveLength(1);
  });
});

describe("resolveTransitionRef", () => {
  it("finds a transition by from/to", () => {
    const draft = applyOp(baseDraft(), { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 0 } });
    expect(resolveTransitionRef(draft, { from: "start", to: "vault" })).toBe(0);
    expect(resolveTransitionRef(draft, { from: "start", to: "missing" })).toBe(-1);
  });

  it("leaves the draft unchanged when a ref does not resolve", () => {
    const draft = baseDraft();
    const next = applyOp(draft, { kind: "removeTransition", ref: { from: "start", to: "vault" } });
    expect(next).toBe(draft);
  });
});

describe("applyOps", () => {
  it("applies a sequence of ops in order", () => {
    const ops: ProposalOp[] = [
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { q: "has_key", op: "==", v: true }, priority: 0, effects: { progress: { anchor: "vault", amount: 1 } } } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault" }, gate: { q: "has_key", op: "==", v: false } },
    ];
    const next = applyOps(baseDraft(), ops);
    expect(next.transitions).toHaveLength(1);
    expect(next.transitions[0].gate).toEqual({ q: "has_key", op: "==", v: false });
  });
});

describe("describeOp / diffProposal", () => {
  it("classifies ops by action", () => {
    expect(describeOp({ kind: "addQuality", quality: { key: "x", type: "string", source: "extractor", rubric: "" } }).action).toBe("add");
    expect(describeOp({ kind: "removeQuality", key: "x" }).action).toBe("remove");
    expect(describeOp({ kind: "updateCheckpoint", id: "vault", patch: {} }).action).toBe("update");
  });

  it("groups a proposal diff", () => {
    const diff = diffProposal([
      { kind: "addQuality", quality: { key: "loot", type: "int", source: "extractor", rubric: "?" } },
      { kind: "removeQuality", key: "has_key" },
    ]);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.items[0].index).toBe(0);
  });

  it("keeps provisioning out of the draft buckets so bulk accept cannot reach it", () => {
    const diff = diffProposal([
      { kind: "addQuality", quality: { key: "loot", type: "int", source: "extractor", rubric: "?" } },
      { kind: "createCharacterCard", name: "Arin", description: "A guide." },
      { kind: "createGroup", name: "Party", members: ["Arin"] },
    ]);
    expect(diff.items).toHaveLength(1);
    expect(diff.added).toHaveLength(1);
    expect(diff.provisioning.map((item) => item.index)).toEqual([1, 2]);
    expect(diff.provisioning[0].action).toBe("provision");
    expect(diff.provisioning[0].label).toContain("Arin");
  });
});

describe("provisioning ops against the draft", () => {
  it("never mutates the draft", () => {
    const draft = baseDraft();
    expect(applyOp(draft, { kind: "createStoryLorebook", name: "Vault Lore" })).toBe(draft);
    expect(isProvisioningOp({ kind: "createStoryLorebook", name: "Vault Lore" })).toBe(true);
    expect(isProvisioningOp({ kind: "removeQuality", key: "has_key" })).toBe(false);
  });

  it("turns a created card into a requirement and a roster member", () => {
    const ops = provisioningFollowUpOps(baseDraft(), { kind: "createCharacterCard", name: "Arin", description: "A guide." });
    expect(ops).toEqual([
      { kind: "setRequirements", requirements: { members: ["Arin"] } },
      { kind: "addRosterMember", member: { id: "arin", name: "Arin" } },
    ]);
    const next = applyOps(baseDraft(), ops);
    expect(next.requirements).toEqual({ members: ["Arin"] });
    expect(next.roster).toEqual([{ id: "arin", name: "Arin" }]);
  });

  it("merges into existing requirements without duplicating, and skips a roster member already present", () => {
    const draft: StoryV2 = { ...baseDraft(), requirements: { members: ["Arin"], lorebooks: ["Vault Lore"] }, roster: [{ id: "guide", name: "arin" }] };
    expect(provisioningFollowUpOps(draft, { kind: "createCharacterCard", name: "Arin", description: "A guide." })).toEqual([
      { kind: "setRequirements", requirements: { members: ["Arin"], lorebooks: ["Vault Lore"] } },
    ]);
    expect(provisioningFollowUpOps(draft, { kind: "createStoryLorebook", name: "Heist Lore" })).toEqual([
      { kind: "setRequirements", requirements: { members: ["Arin"], lorebooks: ["Vault Lore", "Heist Lore"] } },
    ]);
  });

  it("leaves the story alone for ops that create nothing it must require", () => {
    expect(provisioningFollowUpOps(baseDraft(), { kind: "upsertLorebookEntry", lorebook: "Vault Lore", comment: "x", keys: [], content: "y" })).toEqual([]);
    expect(provisioningFollowUpOps(baseDraft(), { kind: "createGroup", name: "Party", members: ["Arin"] })).toEqual([]);
  });
});
