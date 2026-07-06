import type { StoryV2 } from "@engine/index";
import { applyOp, applyOps, describeOp, diffProposal, resolveTransitionRef } from "./proposal";
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
});
