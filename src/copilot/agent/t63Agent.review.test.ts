import type { StoryV2 } from "@engine/index";
import { emptyEnvironment, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
import { missingAtDone } from "./finish";
import { approvePlan, continueAgent, executeReply, newAgentSession, NO_CHANGE, REPEAT_LIMIT, resolveProvisioning, type StepMeta } from "./loop";
import { renderStepPrompt } from "./prompt";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-02T16:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const map = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Redrawn Kingdom",
  description: "",
  qualities: [{ key: "ink", type: "int", source: "extractor", rubric: "How much ink?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true },
    { id: "house_varn", name: "House Varn", objective: "Meet Varn.", type: "intermediate" },
  ],
  transitions: [{ from: "start", to: "house_varn", priority: 1, gate: { q: "ink", op: ">=", v: 1 } }],
  roster: [{ id: "halden", name: "Master Halden" }, { id: "marrow", name: "Envoy Marrow" }],
  requirements: { members: ["Master Halden", "Envoy Marrow"] },
  ...patch,
});

const install = (patch: Partial<ProvisioningEnvironment> = {}): ProvisioningEnvironment => ({
  ...emptyEnvironment(),
  characterNames: ["Master Halden", "Envoy Marrow"],
  castNames: ["Master Halden", "Envoy Marrow"],
  ...patch,
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("map", "review", {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT);
const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });
const run = (session: AgentSession, tool: string, args: Record<string, unknown>, draft = map(), environment = install()) =>
  executeReply(session, call(tool, args), agentContext(draft, environment), META).session;

describe("T6-3 HIGH: the agent stops re-reading and re-creating", () => {
  it("answers a guide topic read before with a pointer, not the text again", () => {
    const first = run(running(), "readGuide", { topic: "gates" });
    expect(first.steps[0].status).toBe("observed");
    const again = run(first, "readGuide", { topic: " Gates " });
    expect(again.steps[1].status).toBe("refused");
    expect(again.steps[1].observation).toContain("already read at step #1");
    expect(again.steps[1].observation.length).toBeLessThan(400);
  });

  it("refuses a read whose answer has not changed since the last identical read", () => {
    const first = run(running(), "readCheckpoint", { id: "start" });
    const same = run(first, "readCheckpoint", { id: "start" });
    expect(same.steps[1].status).toBe("refused");
    expect(same.steps[1].observation).toContain("nothing changed since step #1");
    const changed = run(first, "readCheckpoint", { id: "start" }, map({ checkpoints: [{ id: "start", name: "Start", objective: "Begin again.", type: "anchor", start: true }] }));
    expect(changed.steps[1].status).toBe("observed");
  });

  it("refuses re-creating an asset this session already created, naming the step", () => {
    const card: ProvisioningOp = { kind: "createCharacterCard", name: "Lady Ysolde", description: "Varn's heir." };
    const proposed = run(running(), "createCharacterCard", { name: "Lady Ysolde", description: "Varn's heir." }, map(), install({ characterNames: [] }));
    const created = resolveProvisioning(proposed, 1, { ok: true, message: "Created" }, map());
    expect(created.steps[0].op).toEqual(card);
    const again = run(created, "createCharacterCard", { name: "Lady Ysolde", description: "Another try." }, map(), install({ characterNames: ["Lady Ysolde"] }));
    expect(again.steps[1].status).toBe("refused");
    expect(again.steps[1].observation).toContain("already created at step #1");
    expect(renderStepPrompt(again, map(), install())).toContain("ALREADY CREATED THIS SESSION");
  });

  it("ends the run with an author message when the same refused call repeats", () => {
    let session = running();
    for (let index = 0; index < REPEAT_LIMIT; index += 1) session = run(session, "updateCheckpoint", { id: "start", patch: { objective: "Begin." } });
    expect(session.status).toBe("stopped");
    expect(session.stopReason).toContain(`${REPEAT_LIMIT} times`);
    expect(session.stopReason).toContain(NO_CHANGE);
  });

  it("offers Continue after Finished: the plan resumes with budget", () => {
    const done = { ...running(), status: "done" as const, summary: "Recommend resuming with a fresh budget." };
    const resumed = continueAgent(done);
    expect(resumed.status).toBe("running");
    expect(resumed.notes.at(-1)?.role).toBe("author");
  });
});

describe("T6-3 HIGH: the group holds the whole required cast", () => {
  it("refuses a group missing a required member, naming the member", () => {
    const session = run(running(), "createGroup", { name: "The Redrawn Kingdom", members: ["Master Halden"] });
    expect(session.steps[0].status).toBe("refused");
    expect(session.steps[0].observation).toContain("Envoy Marrow");
  });

  it("does not finish while an applied group lacks a required member", () => {
    const partial = { ...running(), steps: [{
      id: 1, at: AT, route: "local" as const, call: { tool: "createGroup", args: {} }, family: "provision" as const, status: "applied" as const,
      op: { kind: "createGroup" as const, name: "The Redrawn Kingdom", members: ["Master Halden"] }, observation: "Created", firstTryValid: true, repaired: false,
    }] };
    expect(missingAtDone(partial, map(), install({ groupNames: ["The Redrawn Kingdom"] })).join(" ")).toContain('the group "The Redrawn Kingdom" lacks Envoy Marrow');
  });
});

describe("T6-3 MEDIUM: an invalid field value is refused with its reason, never half applied", () => {
  it("refuses a numeric or unknown tension_target with the allowed values", () => {
    for (const value of [3, "high"]) {
      const session = run(running(), "updateCheckpoint", { id: "start", patch: { tension_target: value, guidance: "Keep it quiet." } });
      expect(session.steps[0].status).toBe("refused");
      expect(session.steps[0].observation).toContain("calm, stirring, tense, critical, peak");
    }
  });

  it("refuses agency given as a string, and applies an agency object", () => {
    const text = run(running(), "updateCheckpoint", { id: "start", patch: { agency: "protect the player" } });
    expect(text.steps[0].status).toBe("refused");
    expect(text.steps[0].observation).toContain("agency");
    const object = run(running(), "updateCheckpoint", { id: "start", patch: { agency: { protect_player_choice: true } } });
    expect(object.steps[0].status).toBe("pending");
  });

  it("refuses talk_control whose speakers is not a list of members, and applies a well-formed one (v2.8 09 §F spike)", () => {
    for (const speakers of ["Arin", { member: "Arin" }, ["Arin"]]) {
      const session = run(running(), "updateCheckpoint", { id: "start", patch: { talk_control: { speakers } } });
      expect(session.steps[0].status).toBe("refused");
      expect(session.steps[0].observation).toContain("talk_control");
    }
    const object = run(running(), "updateCheckpoint", { id: "start", patch: { talk_control: { speakers: [{ member: "arin" }] } } });
    expect(object.steps[0].status).toBe("pending");
  });

  it("refuses a card whose before and after read the same", () => {
    const session = run(running(), "setRequirements", { requirements: { members: ["Envoy Marrow", "Master Halden"] } });
    expect(session.steps[0].status).toBe("refused");
    expect(session.steps[0].observation).toContain(NO_CHANGE);
  });
});
