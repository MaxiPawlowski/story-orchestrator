import type { StoryV2 } from "@engine/index";
import { parseProposal } from "./parse";
import { validateProposal } from "./validate";
import type { ProposalOp } from "./types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readGolden = (name: string): string => readFileSync(join(process.cwd(), "test/goldens", name), "utf8");

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

describe("validateProposal", () => {
  it("accepts each valid stage golden with no blocking problems", () => {
    for (const name of ["copilot-qualities", "copilot-transitions", "copilot-effects", "copilot-checkpoints"]) {
      const { proposal } = parseProposal(readGolden(`${name}.response.txt`));
      expect(validateProposal(baseDraft(), proposal.ops).blocking).toEqual([]);
    }
  });

  it("blocks a gate referencing an undeclared quality", () => {
    const ops: ProposalOp[] = [{ kind: "addTransition", transition: { from: "start", to: "vault", gate: { q: "ghost", op: "==", v: true }, priority: 0 } }];
    const result = validateProposal(baseDraft(), ops);
    expect(result.blocking.some((issue) => issue.includes("ghost"))).toBe(true);
  });

  it("blocks an intermediate checkpoint that cannot reach an anchor", () => {
    const ops: ProposalOp[] = [{ kind: "addCheckpoint", checkpoint: { id: "orphan", name: "Orphan", objective: "", type: "intermediate" } }];
    const result = validateProposal(baseDraft(), ops);
    expect(result.blocking.some((issue) => issue.includes("reachable anchor"))).toBe(true);
  });

  it("blocks an update op whose target does not exist", () => {
    const cases: ProposalOp[] = [
      { kind: "updateCheckpoint", id: "ghost", patch: { objective: "x" } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault" }, gate: { q: "has_key", op: "==", v: true } },
      { kind: "updateQuality", key: "ghost", patch: { rubric: "x" } },
    ];
    for (const op of cases) {
      const result = validateProposal(baseDraft(), [op]);
      expect(result.blocking.some((issue) => issue.includes("not found"))).toBe(true);
    }
  });

  it("resolves an intra-proposal target added by an earlier op", () => {
    const ops: ProposalOp[] = [
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 0 } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault" }, gate: { q: "has_key", op: "==", v: true } },
    ];
    expect(validateProposal(baseDraft(), ops).blocking).toEqual([]);
  });

  it("surfaces warnings without blocking", () => {
    const ops: ProposalOp[] = [{ kind: "addCheckpoint", checkpoint: { id: "island", name: "Island", objective: "", type: "anchor" } }];
    const result = validateProposal(baseDraft(), ops);
    expect(result.blocking).toEqual([]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "anchor-unreachable")).toBe(true);
  });
});
