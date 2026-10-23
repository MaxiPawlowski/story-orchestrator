import type { Story } from "@engine/index";
import { applyAgentOp, approvePlan, decideStep, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";
import { runDiagnostics } from "../../studio/diagnostics";

const AT = "2026-10-21T15:00:00.000Z";
const META: StepMeta = { route: "harness", firstTryValid: true, repaired: false, at: AT };

const dock = (): Story => ({
  title: "SO-V29-04 cues",
  description: "",
  qualities: [{ key: "searched_dock", type: "bool", source: "extractor", rubric: "Has the player searched the dock?" }],
  checkpoints: [
    { id: "dock", name: "The Dock", objective: "Look around.", type: "anchor", start: true },
    { id: "shed", name: "The Shed", objective: "Open the shed.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "shed", priority: 0, gate: { q: "searched_dock", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin" }, { id: "bo", name: "Bo" }],
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("codex", "review", {}, AT), plan: ["cues"], status: "awaiting-plan" }, ["cues"], AT);
const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

const harness = (start: Story) => {
  let draft = start;
  let session = running();
  const step = (tool: string, args: Record<string, unknown> = {}) => {
    const turn = executeReply(session, call(tool, args), agentContext(draft), META);
    session = turn.session;
    if (turn.apply) draft = applyAgentOp(draft, turn.apply);
    return session.steps.at(-1)!;
  };
  const accept = (id: number) => {
    const turn = decideStep(session, id, { kind: "accept" }, draft);
    session = turn.session;
    if (turn.apply) draft = applyAgentOp(draft, turn.apply);
    return session.steps.find((entry) => entry.id === id)!;
  };
  return { step, accept, draft: () => draft };
};

const SEARCHED = { q: "searched_dock", op: "==", v: true };
const CUE = { id: "dock", kind: "reaction", when: SEARCHED, cue: "someone searched the dock" };
const TOPIC = { id: "shed", keys: ["shed"], tiers: [{ cue: "the shed is locked" }] };
const NORM = { id: "quiet", label: "no searching at night", broken_when: SEARCHED, noticed_by: ["bo"], cue: "the dock was searched" };

describe("v2.9 plan 04: the wizard writes cues, topics and norms only through its tools, in review", () => {
  it("setCue, setTopic and setNorm wait for the author, then land in the draft", () => {
    const run = harness(dock());
    const cards = [run.step("setCue", { member: "arin", cue: CUE }), run.step("setTopic", { member: "arin", topic: TOPIC }), run.step("setNorm", { norm: NORM })];
    expect(cards.map((card) => card.status)).toEqual(["pending", "pending", "pending"]);
    expect(run.draft().roster[0].cues).toBeUndefined();
    cards.forEach((card) => expect(run.accept(card.id).status).toBe("accepted"));
    expect(run.draft().roster[0]).toEqual(expect.objectContaining({ cues: [CUE], topics: [TOPIC] }));
    expect(run.draft().norms).toEqual([NORM]);
    expect(runDiagnostics(run.draft()).filter((entry) => entry.code.startsWith("cue-") || entry.code.startsWith("topic-"))).toEqual([]);
  });

  it("refuses a bad cue before it reaches a card", () => {
    const run = harness(dock());
    expect(run.step("setCue", { member: "ghost", cue: CUE }).status).toBe("refused");
    expect(run.step("setCue", { member: "arin", cue: { ...CUE, when: { not: SEARCHED } } }).status).toBe("refused");
    expect(run.step("setCue", { member: "arin", cue: { ...CUE, lane: "must" } }).status).toBe("refused");
    expect(run.step("setTopic", { member: "arin", topic: { ...TOPIC, keys: ["Bo"] } }).status).toBe("refused");
    expect(run.step("setNorm", { norm: { ...NORM, noticed_by: ["ghost"] } }).status).toBe("refused");
    expect(run.draft().roster[0].cues).toBeUndefined();
  });

  it("removes what it set and refuses an unknown id", () => {
    const run = harness(dock());
    run.accept(run.step("setCue", { member: "arin", cue: CUE }).id);
    expect(run.step("removeCue", { member: "arin", id: "nope" }).status).toBe("refused");
    run.accept(run.step("removeCue", { member: "arin", id: "dock" }).id);
    expect(run.draft().roster[0].cues).toBeUndefined();
  });
});
