import type { StoryV2 } from "@engine/index";
import { doneSummary } from "./finish";
import { approvePlan, executeReply, NO_CHANGE, newAgentSession, opPreview, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-02T11:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const redline = (): StoryV2 => ({
  format: 2,
  title: "The Redline Kingdom",
  description: "",
  qualities: [{ key: "ink_awareness", type: "int", source: "extractor", rubric: "How much does the apprentice understand?" }],
  checkpoints: [
    { id: "start", name: "The Ink That Moves", objective: "Notice.", type: "anchor", start: true, guidance: "No noble house appears yet." },
    { id: "first_house", name: "The First Approach", objective: "Meet Vael.", type: "intermediate" },
    { id: "redline", name: "The Redline", objective: "Choose.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "first_house", priority: 1, gate: { q: "ink_awareness", op: ">=", v: 1 } },
    { from: "first_house", to: "redline", priority: 1, gate: { q: "ink_awareness", op: ">=", v: 3 } },
  ],
  roster: [{ id: "master_ilse", name: "Master Ilse" }, { id: "lord_vael", name: "Lord Vael", drive: "Hold the pen." }, { id: "lady_corvane", name: "Lady Corvane" }],
});

const running = (): AgentSession => ({
  ...approvePlan({ ...newAgentSession("redline", "review", {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT),
  steps: [],
});

const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

describe("T5-1 HIGH: the done summary claims only what the draft holds", () => {
  const claim = "Built the beats with tension, agency, guidance and talk_control on every checkpoint. The tone is quiet dread.";

  it("drops a coverage claim the draft does not back, keeps the rest, and states the real coverage", () => {
    const summary = doneSummary(running(), redline(), claim);
    expect(summary).not.toContain("talk_control");
    expect(summary).toContain("Checkpoints with guidance 1 of 3.");
    expect(summary).toContain("The tone is quiet dread.");
  });

  it("drops an 'every checkpoint' claim that holds on only some of them", () => {
    expect(doneSummary(running(), redline(), "Guidance sits on every checkpoint.")).not.toContain("Guidance sits");
    expect(doneSummary(running(), redline(), "The opening carries guidance.")).toContain("The opening carries guidance.");
  });
});

describe("T5-1 HIGH: an edit that changes nothing is refused, so it never becomes a card", () => {
  it("refuses updateCheckpoint with an empty patch", () => {
    const turn = executeReply(running(), call("updateCheckpoint", { id: "start", patch: {} }), agentContext(redline()), META);
    expect(turn.apply).toBeNull();
    expect(turn.session.steps[0]).toMatchObject({ status: "refused", observation: `Refused: ${NO_CHANGE}` });
  });

  it("still takes a patch that changes the beat", () => {
    const turn = executeReply(running(), call("updateCheckpoint", { id: "start", patch: { objective: "Notice the ink." } }), agentContext(redline()), META);
    expect(turn.session.steps[0].status).toBe("pending");
  });
});

describe("T5-1 HIGH: the agent writes cast_changes by card name", () => {
  it("resolves roster ids in setCheckpointEffects and says so", () => {
    const turn = executeReply(running(), call("setCheckpointEffects", { id: "start", effects: { cast_changes: { disable: ["lord_vael", "Lady Corvane"] } } }), agentContext(redline()), META);
    const step = turn.session.steps[0];
    expect(step.status).toBe("pending");
    expect(step.op).toMatchObject({ kind: "setCheckpointEffects", effects: { cast_changes: { disable: ["Lord Vael", "Lady Corvane"] } } });
    expect(step.observation).toContain("lord_vael → Lord Vael");
  });
});

describe("T5-1 LOW: a drive card previews the drive", () => {
  it("shows the member's drive before and after, not null/null", () => {
    const preview = opPreview(redline(), { kind: "setRosterDrive", id: "lord_vael", drive: "Own the map." });
    expect(preview).toMatchObject({ before: "Hold the pen.", after: "Own the map." });
  });

  it("shows a checkpoint motive before and after", () => {
    const preview = opPreview(redline(), { kind: "setCheckpointMotive", id: "first_house", member: "lord_vael", motive: "Charm her." });
    expect(preview).toMatchObject({ before: null, after: "Charm her." });
  });
});
