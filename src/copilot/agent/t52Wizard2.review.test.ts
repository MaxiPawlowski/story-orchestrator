import type { StoryV2 } from "@engine/index";
import { emptyEnvironment, type ProvisioningEnvironment } from "@wizard/index";
import { addTransition } from "../../studio/mutations";
import { applyOpsChecked } from "../proposal";
import { addUndoNote, approvePlan, executeReply, newAgentSession, type StepMeta } from "./loop";
import { renderStepPrompt } from "./prompt";
import { agentContext } from "./testing";
import type { AgentMode, AgentSession, AgentStep } from "./types";

const AT = "2026-10-02T11:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };
const GATE = { q: "heist_progress", op: ">=" as const, v: 2 };

const heist = (): StoryV2 => ({
  format: 2,
  title: "The Hoard of the Dead Dragon",
  description: "",
  qualities: [{ key: "heist_progress", type: "int", source: "extractor", rubric: "How far along is the heist?" }],
  checkpoints: [
    { id: "start", name: "The Job", objective: "Take the job.", type: "intermediate", start: true },
    { id: "the_plan", name: "The Plan", objective: "Plan it.", type: "intermediate" },
    { id: "the_infiltration", name: "Inside", objective: "Get in.", type: "intermediate" },
    { id: "the_vault", name: "The Vault", objective: "Open it.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "the_plan", priority: 1, gate: GATE },
    { from: "the_plan", to: "the_infiltration", priority: 1, gate: GATE },
    { from: "the_infiltration", to: "the_vault", priority: 1, gate: GATE },
  ],
  roster: [{ id: "sable", name: "Sable" }, { id: "mirek", name: "Mirek" }],
});

const running = (mode: AgentMode = "auto-draft", steps: AgentStep[] = []): AgentSession => ({
  ...approvePlan({ ...newAgentSession("heist", mode, {}, AT), plan: ["build"], status: "awaiting-plan" }, ["build"], AT),
  steps,
});

const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

const provisioned = (id: number, op: AgentStep["op"], status: AgentStep["status"] = "applied"): AgentStep => ({
  id, at: AT, route: "local", call: { tool: op?.kind ?? "", args: {} }, family: "provision", status, op, observation: "Created.", firstTryValid: true, repaired: false,
});

const install = (patch: Partial<ProvisioningEnvironment>): ProvisioningEnvironment => ({ ...emptyEnvironment(), ...patch });

describe("T5-2-2 MEDIUM: a duplicate transition is refused, and an existing one can be named", () => {
  const twin = { from: "the_plan", to: "the_infiltration", priority: 1, gate: GATE };

  it("addTransition never appends an exact from/to/priority duplicate", () => {
    const draft = heist();
    expect(addTransition(draft, twin)).toBe(draft);
    expect(addTransition(draft, { ...twin, priority: 2 }).transitions).toHaveLength(4);
  });

  it("the agent's addTransition is refused with a way forward (x-p3-transition-churn.json #18)", () => {
    const turn = executeReply(running(), call("addTransition", { transition: twin }), agentContext(heist()), META);
    expect(turn.apply).toBeNull();
    expect(turn.session.steps[0].observation).toContain("transition the_plan → the_infiltration at priority 1 already exists");
  });

  it("a duplicate that already exists names its readGraph numbers, and an index ref repairs it", () => {
    const draft = { ...heist(), transitions: [...heist().transitions, twin] };
    const ambiguous = executeReply(running(), call("removeTransition", { ref: { from: "the_plan", to: "the_infiltration", priority: 1 } }), agentContext(draft), META);
    expect(ambiguous.session.steps[0].observation).toContain("readGraph #2, #4");
    const repaired = executeReply(running(), call("removeTransition", { ref: { from: "the_plan", to: "the_infiltration", index: 4 } }), agentContext(draft), META);
    expect(repaired.session.steps[0].status).toBe("applied");
    expect(applyOpsChecked(draft, [repaired.apply as never]).next.transitions).toEqual(heist().transitions);
  });

  it("an index that names a different edge does not match it", () => {
    const draft = { ...heist(), transitions: [...heist().transitions, twin] };
    const wrong = executeReply(running(), call("setTransitionGate", { ref: { from: "the_plan", to: "the_infiltration", index: 1 }, gate: GATE }), agentContext(draft), META);
    expect(wrong.session.steps[0].status).toBe("refused");
    expect(wrong.session.steps[0].observation).toContain("not found");
  });
});

describe("T5-2-2 MEDIUM: the agent cannot finish while the cast it wrote has no cards or group", () => {
  const cardsMade = (): AgentStep[] => [
    provisioned(1, { kind: "createCharacterCard", name: "Sable", description: "Crew leader." }),
    provisioned(2, { kind: "createStoryLorebook", name: "The Hoard of the Dead Dragon" }),
  ];
  const story = (): StoryV2 => ({ ...heist(), requirements: { members: ["Sable", "Mirek"], lorebooks: ["The Hoard of the Dead Dragon"] } });

  it("refuses done with what is missing (x-p2-done-state.json: 2 of 5 cards, no group)", () => {
    const environment = install({ characterNames: ["Seraphina", "Sable"], lorebookNames: ["The Hoard of the Dead Dragon"] });
    const turn = executeReply(running("auto-draft", cardsMade()), { kind: "done", summary: "Cards for the opening cast." }, agentContext(story(), environment), META);
    expect(turn.session.status).not.toBe("done");
    const step = turn.session.steps.at(-1);
    expect(step).toMatchObject({ status: "refused", call: { tool: "done" } });
    expect(step?.observation).toContain('no card for "Mirek"');
    expect(step?.observation).toContain("no group");
  });

  it("control: everything on the install, or an author rejection, lets it finish", () => {
    const complete = install({ characterNames: ["Sable", "Mirek"], lorebookNames: ["The Hoard of the Dead Dragon"], groupNames: ["The Hoard of the Dead Dragon"] });
    expect(executeReply(running("auto-draft", cardsMade()), { kind: "done", summary: "ok" }, agentContext(story(), complete), META).session.status).toBe("done");
    const rejected = [...cardsMade(), provisioned(3, { kind: "createCharacterCard", name: "Mirek", description: "x" }, "rejected"), provisioned(4, { kind: "createGroup", name: "Heist", members: [] }, "rejected")];
    const partial = install({ characterNames: ["Sable"], lorebookNames: ["The Hoard of the Dead Dragon"] });
    expect(executeReply(running("auto-draft", rejected), { kind: "done", summary: "ok" }, agentContext(story(), partial), META).session.status).toBe("done");
  });

  it("a second done in a row is taken, with the gaps stated, so the agent cannot loop forever", () => {
    const environment = install({ characterNames: ["Sable"], lorebookNames: ["The Hoard of the Dead Dragon"] });
    const first = executeReply(running("auto-draft", cardsMade()), { kind: "done", summary: "ok" }, agentContext(story(), environment), META);
    const second = executeReply(first.session, { kind: "done", summary: "ok" }, agentContext(story(), environment), META);
    expect(second.session.status).toBe("done");
    expect(second.session.summary).toContain('Still missing: no card for "Mirek"');
  });
});

describe("T5-2-2 MEDIUM: the player's own role is never a card or a cast member", () => {
  const greeting = { kind: "createCharacterCard" as const, name: "The Queen's Agent", description: "The crown's agent.", first_mes: "\"You are the pawnbroker,\" she says. It is not a question." };

  it("refuses a card named for the role a greeting gives the player", () => {
    const turn = executeReply(running("review", [provisioned(1, greeting)]), call("createCharacterCard", { name: "The Pawnbroker", description: "Runs the shop." }), agentContext(heist()), META);
    expect(turn.session.steps.at(-1)?.status).toBe("refused");
    expect(turn.session.steps.at(-1)?.observation).toContain("the player is the pawnbroker");
  });

  it("refuses a roster member named for the player's role in the description", () => {
    const draft = { ...heist(), description: "You are the pawnbroker of forgotten days, hired by the crown." };
    const turn = executeReply(running(), call("addRosterMember", { member: { id: "pawnbroker", name: "The Pawnbroker" } }), agentContext(draft), META);
    expect(turn.apply).toBeNull();
    expect(turn.session.steps[0].observation).toContain("the player is the pawnbroker");
  });

  it("control: a card the player meets, and a card in a story that never addresses the player, are fine", () => {
    const met = executeReply(running("review", [provisioned(1, greeting)]), call("createCharacterCard", { name: "The Archivist", description: "Keeps the ledgers." }), agentContext(heist()), META);
    expect(met.session.steps.at(-1)?.status).toBe("pending");
    const plain = executeReply(running("review"), call("createCharacterCard", { name: "The Pawnbroker", description: "Runs the shop." }), agentContext(heist()), META);
    expect(plain.session.steps.at(-1)?.status).toBe("pending");
  });
});

describe("T5-2-2 LOW: the Undo note is shown once", () => {
  it("rides the next prompt, then drops out (payloads.jsonl:161 carried it 70 times)", () => {
    const note = "The author pressed Undo, which changed chapters in the draft behind your last steps.";
    const session = addUndoNote(running(), note, AT);
    expect(renderStepPrompt(session, heist(), emptyEnvironment())).toContain(note);
    const later = { ...session, steps: [{ ...provisioned(1, undefined), family: "read" as const, status: "observed" as const, call: { tool: "readStory", args: {} } }] };
    expect(renderStepPrompt(later, heist(), emptyEnvironment())).not.toContain(note);
    expect(later.notes.map((entry) => entry.text)).toContain(note);
  });

  it("control: an ordinary author note stays in every prompt", () => {
    const session = { ...running(), notes: [...running().notes, { role: "author" as const, text: "Keep it short.", at: AT }], steps: [{ ...provisioned(1, undefined), family: "read" as const, status: "observed" as const, call: { tool: "readStory", args: {} } }] };
    expect(renderStepPrompt(session, heist(), emptyEnvironment())).toContain("Keep it short.");
  });
});

describe("T5-2-2 LOW: the done summary counts the draft, not the model's claim", () => {
  it("states the draft's own counts and drops the model's numbered claims", () => {
    const steps = [
      provisioned(1, { kind: "upsertLorebookEntry", lorebook: "B", comment: "a", keys: ["a"], content: "a" }),
      provisioned(2, { kind: "upsertLorebookEntry", lorebook: "B", comment: "b", keys: ["b"], content: "b" }),
      provisioned(3, { kind: "createCharacterCard", name: "Sable", description: "x" }),
    ];
    const environment = install({ characterNames: ["Sable", "Mirek"], groupNames: ["The Hoard of the Dead Dragon"] });
    const turn = executeReply(running("auto-draft", steps), { kind: "done", summary: "I wrote nine beats and five lorebook entries. The heist is ready to play." }, agentContext(heist(), environment), META);
    const summary = turn.session.summary ?? "";
    expect(summary).toContain("4 checkpoints, 3 transitions, 1 quality, 2 cast members");
    expect(summary).toContain("1 card, 2 lorebook entries");
    expect(summary).toContain("The heist is ready to play.");
    expect(summary).not.toContain("nine");
    expect(summary).not.toContain("five");
  });
});
