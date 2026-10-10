import type { StoryV2 } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { FIRST_MESSAGE_RULE, OPENING_CAST_RULE, renderStagePrompt } from "../prompts";
import { addCheckpoint, addQuality, addRosterMember } from "../../studio/mutations";
import { advanceAgent, approvePlan, budgetSpent, DEFAULT_AGENT_BUDGET, executeReply, newAgentSession, resumeAgent, type StepMeta } from "./loop";
import { renderStepPrompt } from "./prompt";
import { runReadTool } from "./readTools";
import { agentContext, scriptedRoute } from "./testing";
import { emptyLookup, type AgentMode, type AgentSession, type AgentStep } from "./types";

const AT = "2026-10-02T08:10:05.535Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const pawnbroker = (): StoryV2 => ({
  format: 2,
  title: "The Pawnbroker of Forgotten Days",
  description: "",
  qualities: [{ key: "ledger_found", type: "bool", source: "extractor", rubric: "Has the ticket been found?" }],
  checkpoints: [
    { id: "start", name: "The Writ", objective: "Take the writ.", type: "intermediate", start: true },
    { id: "end", name: "The Ticket", objective: "Find the ticket.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { q: "ledger_found", op: "==", v: true } }],
  roster: [{ id: "clerk", name: "Ivet Marrow" }, { id: "thief", name: "Sera Vantel" }],
  requirements: { members: ["Ivet Marrow", "Sera Vantel"], lorebooks: ["The Pawnbroker of Forgotten Days"] },
  house_rules: ["The poor pay in recollections; the rich pay in coin."],
});

const running = (mode: AgentMode = "auto-draft", steps: AgentStep[] = []): AgentSession => ({
  ...approvePlan({ ...newAgentSession("pawnbroker", mode, {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT),
  steps,
});

const provisioned = (id: number, op: AgentStep["op"]): AgentStep => ({
  id, at: AT, route: "local", call: { tool: op?.kind ?? "", args: {} }, family: "provision", status: "applied", op, observation: "Created.", firstTryValid: true, repaired: false,
});

const createdSteps = (): AgentStep[] => [
  provisioned(1, { kind: "createCharacterCard", name: "Ivet Marrow", description: "The clerk." }),
  provisioned(2, { kind: "createCharacterCard", name: "Sera Vantel", description: "The thief." }),
  provisioned(3, { kind: "createStoryLorebook", name: "The Pawnbroker of Forgotten Days" }),
];

const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

describe("T5-2 HIGH: the agent's requirements name characters, never roster ids", () => {
  it("resolves roster ids to card names before the write, and says so (wizard-drafts.json:2486)", () => {
    const turn = executeReply(running("auto-draft", createdSteps()), call("setRequirements", { requirements: { members: ["clerk", "thief", "Osric Vane"], lorebooks: ["The Pawnbroker of Forgotten Days"] } }), agentContext(pawnbroker()), META);
    expect(turn.apply).toEqual({ kind: "setRequirements", requirements: { members: ["Ivet Marrow", "Sera Vantel", "Osric Vane"], lorebooks: ["The Pawnbroker of Forgotten Days"] } });
    const step = turn.session.steps.at(-1);
    expect(step).toMatchObject({ status: "applied", family: "edit" });
    expect(step?.observation).toContain("clerk → Ivet Marrow, thief → Sera Vantel");
  });

  it("refuses a requirements list that drops a card or lorebook this run created, naming the full lists to send", () => {
    const turn = executeReply(running("auto-draft", createdSteps()), call("setRequirements", { requirements: { members: ["Ivet Marrow"] } }), agentContext(pawnbroker()), META);
    expect(turn.apply).toBeNull();
    const step = turn.session.steps.at(-1);
    expect(step?.status).toBe("refused");
    expect(step?.observation).toContain('member "Sera Vantel"');
    expect(step?.observation).toContain('lorebook "The Pawnbroker of Forgotten Days"');
  });

  it("control: a list that keeps what was created, or a story that created nothing, applies unchanged", () => {
    const kept = executeReply(running("auto-draft", createdSteps()), call("setRequirements", { requirements: { members: ["Ivet Marrow", "Sera Vantel", "Osric Vane"], lorebooks: ["The Pawnbroker of Forgotten Days"] } }), agentContext(pawnbroker()), META);
    expect(kept.apply).toEqual({ kind: "setRequirements", requirements: { members: ["Ivet Marrow", "Sera Vantel", "Osric Vane"], lorebooks: ["The Pawnbroker of Forgotten Days"] } });
    const fresh = executeReply(running("auto-draft"), call("setRequirements", { requirements: { members: ["Ivet Marrow"] } }), agentContext(pawnbroker()), META);
    expect(fresh.apply).toEqual({ kind: "setRequirements", requirements: { members: ["Ivet Marrow"] } });
  });
});

describe("T5-2 MEDIUM: an add with an id that exists is refused, never appended", () => {
  it("refuses addCheckpoint, addQuality and addRosterMember on an existing id with a clear message", () => {
    const context = agentContext(pawnbroker());
    const refused = (tool: string, args: Record<string, unknown>) => executeReply(running("auto-draft"), call(tool, args), context, META);
    const checkpoint = refused("addCheckpoint", { checkpoint: { id: "start", name: "Again", objective: "x", type: "intermediate" } });
    expect(checkpoint.apply).toBeNull();
    expect(checkpoint.session.steps[0].observation).toBe('Refused: checkpoint "start" already exists; change it with updateCheckpoint, or pick a new id');
    expect(refused("addQuality", { quality: { key: "ledger_found", type: "bool", source: "extractor", rubric: "again" } }).session.steps[0].status).toBe("refused");
    expect(refused("addRosterMember", { member: { id: "clerk", name: "Someone" } }).session.steps[0].status).toBe("refused");
  });

  it("the mutations themselves never append a duplicate, so removeCheckpoint can no longer take two", () => {
    const draft = pawnbroker();
    expect(addCheckpoint(draft, { id: "start", name: "Again", objective: "", type: "intermediate" })).toBe(draft);
    expect(addQuality(draft, { key: "ledger_found", type: "bool", source: "extractor", rubric: "" })).toBe(draft);
    expect(addRosterMember(draft, { id: "clerk" })).toBe(draft);
    expect(addCheckpoint(draft, { id: "middle", name: "Middle", objective: "", type: "intermediate" }).checkpoints).toHaveLength(3);
  });
});

describe("T5-2 MEDIUM: Continue after Out of budget grants a fresh slice", () => {
  const spent = (): AgentSession => ({ ...running("auto-draft"), status: "budget", budget: { ...DEFAULT_AGENT_BUDGET, usedTokens: DEFAULT_AGENT_BUDGET.maxTokens + 500 } });

  it("resumes with room to work, and the next turn calls the model instead of stopping at once", async () => {
    const resumed = resumeAgent(spent());
    expect(resumed.status).toBe("running");
    expect(budgetSpent(resumed)).toBe(false);
    expect(resumed.budget).toEqual({ maxSteps: DEFAULT_AGENT_BUDGET.maxSteps, maxTokens: 2 * DEFAULT_AGENT_BUDGET.maxTokens + 500, usedTokens: DEFAULT_AGENT_BUDGET.maxTokens + 500 });
    const { route, prompts } = scriptedRoute([{ done: "finished" }]);
    const next = await advanceAgent(resumed, agentContext(pawnbroker(), { ...emptyEnvironment(), groupNames: [pawnbroker().title] }), route, AT);
    expect(prompts).toHaveLength(1);
    expect(next.session.status).toBe("done");
  });

  it("a step budget spent the same way gets more steps too", () => {
    const steps = Array.from({ length: DEFAULT_AGENT_BUDGET.maxSteps }, (_, index) => ({ ...provisioned(index + 1, undefined), family: "read" as const, status: "observed" as const, call: { tool: "readStory", args: {} } }));
    const resumed = resumeAgent({ ...spent(), steps, budget: { ...DEFAULT_AGENT_BUDGET, usedTokens: 1000 } });
    expect(resumed.budget.maxSteps).toBe(2 * DEFAULT_AGENT_BUDGET.maxSteps);
    expect(budgetSpent(resumed)).toBe(false);
  });
});

describe("T5-2 LOW: the agent sees what it did and what the draft holds, so it does not re-read", () => {
  it("keeps a compact line for every step older than the recent window", () => {
    const steps = Array.from({ length: 15 }, (_, index): AgentStep => ({
      id: index + 1, at: AT, route: "local", call: { tool: "addQuality", args: { quality: { key: `q${index + 1}` } } }, family: "edit", status: "applied", observation: "Applied.", firstTryValid: true, repaired: false,
    }));
    const prompt = renderStepPrompt(running("auto-draft", steps), pawnbroker(), emptyEnvironment());
    expect(prompt).toContain("EARLIER STEPS (compact, oldest first)\n#1 addQuality(q1) → applied\n#2 addQuality(q2) → applied\n#3 addQuality(q3) → applied");
    expect(prompt).toContain("RECENT STEPS");
  });

  it("readStory and the DRAFT section carry the house rules and requirements themselves, not only their names", () => {
    const summary = runReadTool("readStory", {}, pawnbroker(), emptyLookup());
    expect(summary).toContain("The poor pay in recollections; the rich pay in coin.");
    expect(summary).toContain('"members":["Ivet Marrow","Sera Vantel"]');
  });
});

describe("T5-2 MEDIUM: cards greet for the opening scene only, and only the opening cast is present", () => {
  it("both wizards tell the model, and the agent's card tool says it on first_mes", () => {
    const agent = renderStepPrompt(running(), pawnbroker(), emptyEnvironment());
    expect(agent).toContain(FIRST_MESSAGE_RULE);
    expect(agent).toContain(OPENING_CAST_RULE);
    expect(agent).toContain("first_mes?: string (only for the opening scene's cast");
    expect(renderStagePrompt("provisioning", pawnbroker(), "", [])).toContain(FIRST_MESSAGE_RULE);
    expect(renderStagePrompt("effects", pawnbroker(), "", [])).toContain(OPENING_CAST_RULE);
    expect(FIRST_MESSAGE_RULE).toContain("no secret, twist, guilt or later-beat reveal");
    expect(OPENING_CAST_RULE).toContain("cast_changes");
  });
});
