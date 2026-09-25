import { isValidationErrorList, parseStoryV2, type StoryV2 } from "@engine/index";
import { parseProposal } from "./parse";
import { validateProposal } from "./validate";
import { renderStagePrompt } from "./prompts";
import { defersReachability, STAGE_OPS, stageOpIssues } from "./stages";
import { COPILOT_STAGES, type ProposalOp } from "./types";
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
    for (const stage of ["qualities", "transitions", "effects", "checkpoints"] as const) {
      const { proposal } = parseProposal(readGolden(`copilot-${stage}.response.txt`));
      expect(validateProposal(baseDraft(), proposal.ops, stage).blocking).toEqual([]);
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

  it("blocks a transition ref that matches multiple transitions without a disambiguating priority", () => {
    const ops: ProposalOp[] = [
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 0 } },
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 1 } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault" }, gate: { q: "has_key", op: "==", v: true } },
    ];
    const result = validateProposal(baseDraft(), ops);
    expect(result.blocking.some((issue) => issue.includes("ambiguous"))).toBe(true);
  });

  it("allows a transition ref disambiguated by priority", () => {
    const ops: ProposalOp[] = [
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 0 } },
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 1 } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault", priority: 1 }, gate: { q: "has_key", op: "==", v: true } },
    ];
    expect(validateProposal(baseDraft(), ops).blocking).toEqual([]);
  });

  it("resolves an intra-proposal target added by an earlier op", () => {
    const ops: ProposalOp[] = [
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { all: [] }, priority: 0 } },
      { kind: "setTransitionGate", ref: { from: "start", to: "vault" }, gate: { q: "has_key", op: "==", v: true } },
    ];
    expect(validateProposal(baseDraft(), ops).blocking).toEqual([]);
  });

  it("refuses an op outside the running stage, per op, naming the stage that allows it, and keeps it out of the preview", () => {
    const ops: ProposalOp[] = [
      { kind: "addCheckpoint", checkpoint: { id: "vault2", name: "Vault 2", objective: "Crack the second vault.", type: "anchor" } },
      { kind: "addTransition", transition: { from: "start", to: "vault", gate: { q: "has_key", op: "==", v: true }, priority: 0 } },
      { kind: "addQuality", quality: { key: "alarm", type: "bool", source: "extractor", rubric: "Is the alarm tripped?" } },
    ];
    const result = validateProposal(baseDraft(), ops, "checkpoints");
    expect(result.stageIssues).toEqual([
      "ops.1: addTransition is not allowed in the checkpoints stage; the transitions stage allows it",
      "ops.2: addQuality is not allowed in the checkpoints stage; the qualities stage allows it",
    ]);
    expect(result.blocking).toEqual(expect.arrayContaining(result.stageIssues));
    expect(result.blocking.some((issue) => issue.startsWith("ops.0"))).toBe(false);
    expect(result.next.checkpoints.map((checkpoint) => checkpoint.id)).toContain("vault2");
    expect(result.next.transitions).toEqual([]);
    expect(result.next.qualities.map((quality) => quality.key)).toEqual(["has_key"]);
  });

  it("names every stage that allows a shared kind, the provisioning stage for a create op, and no stage for a kind none proposes", () => {
    const ops: ProposalOp[] = [
      { kind: "setStoryField", field: "title", value: "Renamed" },
      { kind: "createCharacterCard", name: "Arin", description: "A guide." },
      { kind: "removeCheckpoint", id: "vault" },
    ];
    expect(validateProposal(baseDraft(), ops, "transitions").stageIssues).toEqual([
      "ops.0: setStoryField is not allowed in the transitions stage; the qualities or effects stage allows it",
      "ops.1: createCharacterCard is not allowed in the transitions stage; the provisioning stage allows it",
      "ops.2: removeCheckpoint is not allowed in the transitions stage; no wizard stage proposes it",
    ]);
    expect(validateProposal(baseDraft(), [{ kind: "addQuality", quality: { key: "alarm", type: "bool", source: "extractor", rubric: "Is the alarm tripped?" } }], "provisioning").stageIssues).toEqual([
      "ops.0: addQuality is not allowed in the provisioning stage; the qualities stage allows it",
    ]);
  });

  it("control: ops inside the running stage raise no stage issue, and no stage means no stage check", () => {
    const inStage: ProposalOp[] = [
      { kind: "addCheckpoint", checkpoint: { id: "vault2", name: "Vault 2", objective: "Crack the second vault.", type: "anchor" } },
      { kind: "updateCheckpoint", id: "vault", patch: { objective: "Open it quietly." } },
    ];
    const checked = validateProposal(baseDraft(), inStage, "checkpoints");
    expect(checked.stageIssues).toEqual([]);
    expect(checked.blocking).toEqual([]);
    const ops: ProposalOp[] = [{ kind: "addTransition", transition: { from: "start", to: "vault", gate: { q: "has_key", op: "==", v: true }, priority: 0 } }];
    const unscoped = validateProposal(baseDraft(), ops);
    expect(unscoped.stageIssues).toEqual([]);
    expect(unscoped.blocking).toEqual([]);
    expect(unscoped.next.transitions).toHaveLength(1);
  });

  it("the stage prompt and the validator read one allowed list", () => {
    for (const stage of COPILOT_STAGES) {
      const listed = /Only emit ([A-Za-z/]+) ops/.exec(renderStagePrompt(stage, baseDraft(), "", []))?.[1].split("/");
      expect(listed).toEqual([...STAGE_OPS[stage]]);
      for (const kind of STAGE_OPS[stage]) expect(stageOpIssues(stage, [{ kind } as ProposalOp])).toEqual([]);
    }
  });

  describe("an intermediate the checkpoints stage adds is connected by the transitions stage", () => {
    const linked = (): StoryV2 => ({ ...baseDraft(), transitions: [{ from: "start", to: "vault", priority: 1, gate: { q: "has_key", op: "==", v: true } }] });
    const lobby: ProposalOp = { kind: "addCheckpoint", checkpoint: { id: "lobby", name: "Lobby", objective: "Crack the lobby door.", type: "intermediate" } };
    const withLobby = (): StoryV2 => validateProposal(linked(), [lobby], "checkpoints").next;

    it("only a stage before the transitions stage defers it; no stage (Studio save, import) never does", () => {
      expect(COPILOT_STAGES.map((stage) => [stage, defersReachability(stage)])).toEqual([
        ["qualities", true],
        ["checkpoints", true],
        ["transitions", false],
        ["effects", false],
        ["provisioning", false],
      ]);
      expect(defersReachability(undefined)).toBe(false);
    });

    it("defers the reachability finding for a checkpoint the proposal adds, as a note naming the transitions stage", () => {
      const result = validateProposal(linked(), [lobby], "checkpoints");
      expect(result.blocking).toEqual([]);
      expect(result.deferred).toEqual(["checkpoints.2: intermediate checkpoint 'lobby' has no route to an anchor yet; the transitions stage must connect it"]);
      expect(isValidationErrorList(parseStoryV2(result.next))).toBe(true);
    });

    it("control: without a stage (Studio save, import) the same proposal stays blocking", () => {
      const result = validateProposal(linked(), [lobby]);
      expect(result.deferred).toEqual([]);
      expect(result.blocking).toEqual(["checkpoints.2: intermediate checkpoint has no reachable anchor beyond it"]);
    });

    it("control: the transitions stage and every later stage block an intermediate still unconnected", () => {
      const ops: ProposalOp[] = [{ kind: "addTransition", transition: { from: "start", to: "vault", priority: 2, gate: { q: "has_key", op: "==", v: false } } }];
      for (const stage of ["transitions", "effects"] as const) {
        const result = validateProposal(withLobby(), stage === "transitions" ? ops : [], stage);
        expect(result.deferred).toEqual([]);
        expect(result.blocking).toEqual(["checkpoints.2: intermediate checkpoint has no reachable anchor beyond it"]);
      }
    });

    it("control: in the checkpoints stage, an unconnected intermediate the draft already held, or one an update makes, stays blocking", () => {
      const held = validateProposal(withLobby(), [{ kind: "updateCheckpoint", id: "lobby", patch: { objective: "Crack it quietly." } }], "checkpoints");
      expect(held.deferred).toEqual([]);
      expect(held.blocking).toEqual(["checkpoints.2: intermediate checkpoint has no reachable anchor beyond it"]);
      const demoted = validateProposal(linked(), [{ kind: "updateCheckpoint", id: "vault", patch: { type: "intermediate" } }], "checkpoints");
      expect(demoted.deferred).toEqual([]);
      expect(demoted.blocking).toContain("checkpoints.1: intermediate checkpoint has no reachable anchor beyond it");
    });

    it("control: every other finding in the same proposal stays blocking", () => {
      const ops: ProposalOp[] = [lobby, { kind: "setCheckpointSnapshot", id: "lobby", snapshot: { ghost: true } }];
      const result = validateProposal(linked(), ops, "checkpoints");
      expect(result.deferred).toHaveLength(1);
      expect(result.blocking).toEqual(["checkpoints.2.state_snapshot.ghost: unknown quality 'ghost'"]);
    });

    it("the transitions stage that connects it validates clean, and the story then parses", () => {
      const ops: ProposalOp[] = [
        { kind: "updateTransition", ref: { from: "start", to: "vault" }, patch: { to: "lobby" } },
        { kind: "addTransition", transition: { from: "lobby", to: "vault", priority: 1, gate: { q: "has_key", op: "==", v: true } } },
      ];
      const result = validateProposal(withLobby(), ops, "transitions");
      expect(result.blocking).toEqual([]);
      expect(result.deferred).toEqual([]);
      expect(isValidationErrorList(parseStoryV2(result.next))).toBe(false);
    });
  });

  it("surfaces warnings without blocking", () => {
    const ops: ProposalOp[] = [{ kind: "addCheckpoint", checkpoint: { id: "island", name: "Island", objective: "", type: "anchor" } }];
    const result = validateProposal(baseDraft(), ops);
    expect(result.blocking).toEqual([]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "anchor-unreachable")).toBe(true);
  });
});
