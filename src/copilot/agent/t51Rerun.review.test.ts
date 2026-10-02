import type { StoryV2 } from "@engine/index";
import { emptyEnvironment, type ProvisioningEnvironment } from "@wizard/index";
import { approvePlan, decideStep, executeReply, newAgentSession, type StepMeta } from "./loop";
import { renderStepPrompt } from "./prompt";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-02T14:20:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const kingdom = (): StoryV2 => ({
  format: 2,
  title: "The Redrawn Kingdom",
  description: "",
  qualities: [{ key: "map_truth", type: "enum", values: ["asleep", "awake"], source: "extractor", rubric: "Is the map awake?" }],
  checkpoints: [{ id: "start", name: "The Inkwell", objective: "Notice.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "orin", name: "Master Orin" }, { id: "lord_vael", name: "Lord Vael" }],
});

const install = (patch: Partial<ProvisioningEnvironment> = {}): ProvisioningEnvironment => ({
  ...emptyEnvironment(),
  characterNames: ["Mira", "Master Orin", "Lord Vael"],
  castNames: ["Master Orin", "Lord Vael"],
  personaNames: ["Max Nightriver"],
  ...patch,
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("kingdom", "review", {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT);

const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

describe("T5-1-3 HIGH: the agent sees why a foreign group member is refused", () => {
  it("refuses createGroup naming another story's card, with the cast in the reason", () => {
    const turn = executeReply(running(), call("createGroup", { name: "The Redrawn Kingdom", members: ["Mira", "Master Orin", "Lord Vael"] }), agentContext(kingdom(), install()), META);
    const step = turn.session.steps[0];
    expect(step.status).toBe("refused");
    expect(step.observation).toContain("Not in this story's cast: \"Mira\"");
    expect(step.observation).toContain("Master Orin, Lord Vael");
  });

  it("still sends a group of the story's own cast to the author", () => {
    const turn = executeReply(running(), call("createGroup", { name: "The Redrawn Kingdom", members: ["Master Orin", "Lord Vael"] }), agentContext(kingdom(), install()), META);
    expect(turn.session.steps[0].status).toBe("pending");
  });
});

describe("T5-1-4 HIGH: the agent never requires a persona the install does not have", () => {
  it("refuses setRequirements naming a persona that does not exist, and says personas are never created", () => {
    const turn = executeReply(running(), call("setRequirements", { requirements: { personas: ["The Apprentice"], members: ["Master Orin"] } }), agentContext(kingdom(), install()), META);
    const step = turn.session.steps[0];
    expect(step.status).toBe("refused");
    expect(step.observation).toContain('"The Apprentice"');
    expect(step.observation).toContain("never created");
  });

  it("accepts a persona the install has", () => {
    const turn = executeReply(running(), call("setRequirements", { requirements: { personas: ["Max Nightriver"], members: ["Master Orin"] } }), agentContext(kingdom(), install()), META);
    expect(turn.session.steps[0].status).toBe("pending");
  });
});

describe("T5-1-3 MEDIUM: what the author rejected stays rejected for the session", () => {
  const foreignBook = call("createStoryLorebook", { name: "The Sun Ruins Expedition" });
  const rejected = () => {
    const proposed = executeReply(running(), foreignBook, agentContext(kingdom(), install()), META);
    expect(proposed.session.steps[0].status).toBe("pending");
    return decideStep(proposed.session, 1, { kind: "reject", reason: "That belongs to another story." }, kingdom()).session;
  };

  it("refuses the identical op locally, quoting the author's reason", () => {
    const again = executeReply(rejected(), foreignBook, agentContext(kingdom(), install()), META);
    const step = again.session.steps[1];
    expect(step.status).toBe("refused");
    expect(step.observation).toContain("the author rejected this");
    expect(step.observation).toContain("That belongs to another story.");
  });

  it("refuses the same asset under a different casing", () => {
    const again = executeReply(rejected(), call("createStoryLorebook", { name: "the sun ruins expedition " }), agentContext(kingdom(), install()), META);
    expect(again.session.steps[1].status).toBe("refused");
  });

  it("lets a different op through", () => {
    const other = executeReply(rejected(), call("createStoryLorebook", { name: "The Redrawn Kingdom" }), agentContext(kingdom(), install()), META);
    expect(other.session.steps[1].status).toBe("pending");
  });

  it("keeps every rejection, with its reason, in the prompt for the rest of the session", () => {
    let session = rejected();
    for (let index = 0; index < 20; index += 1) session = executeReply(session, call("readStory", {}), agentContext(kingdom(), install()), META).session;
    const prompt = renderStepPrompt(session, kingdom(), install());
    expect(prompt).toContain("REJECTED BY THE AUTHOR");
    expect(prompt).toContain("createStoryLorebook(The Sun Ruins Expedition): That belongs to another story.");
  });
});
