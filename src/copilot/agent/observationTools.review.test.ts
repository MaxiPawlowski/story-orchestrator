import type { Story } from "@engine/index";
import { applyAgentOp, approvePlan, decideStep, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";
import { runDiagnostics } from "../../studio/diagnostics";

const AT = "2026-10-21T15:00:00.000Z";
const META: StepMeta = { route: "harness", firstTryValid: true, repaired: false, at: AT };

const dock = (): Story => ({
  title: "SO-V29-08 observations",
  description: "",
  qualities: [{ key: "searched_dock", type: "bool", source: "extractor", rubric: "Has the player searched the dock?" }],
  checkpoints: [
    { id: "dock", name: "The Dock", objective: "Look around.", type: "anchor", start: true },
    { id: "shed", name: "The Shed", objective: "Open the shed.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "shed", priority: 0, gate: { q: "searched_dock", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin" }],
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("codex", "review", {}, AT), plan: ["details"], status: "awaiting-plan" }, ["details"], AT);
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

const SCRATCHES = { id: "scratches", text: "Fresh scratches circle the lock of the shed.", when: { q: "searched_dock", op: "==", v: true }, source: "arin" };

describe("v2.9 08 slice 4: the wizard writes observations only through its tools, in review", () => {
  it("setObservation waits for the author, then lands in the draft with no wording warning", () => {
    const run = harness(dock());
    const card = run.step("setObservation", { observation: SCRATCHES });
    expect(card.status).toBe("pending");
    expect(run.draft().observations).toBeUndefined();
    expect(run.accept(card.id).status).toBe("accepted");
    expect(run.draft().observations).toEqual([SCRATCHES]);
    expect(runDiagnostics(run.draft()).filter((entry) => entry.code.startsWith("observation-"))).toEqual([]);
    expect(run.step("readStory").observation).toContain("\"observations\":[{\"id\":\"scratches\"");
  });

  it("refuses an invalid line before it reaches a card: unknown key, own key, start, a voice", () => {
    const run = harness(dock());
    expect(run.step("setObservation", { observation: { ...SCRATCHES, when: { q: "searched_dok", op: "==", v: true } } }).status).toBe("refused");
    expect(run.step("setObservation", { observation: { ...SCRATCHES, id: "a", when: { q: "obs_a", op: ">=", v: 1 } } }).status).toBe("refused");
    expect(run.step("setObservation", { observation: { ...SCRATCHES, id: "b", when: "start" } }).status).toBe("refused");
    expect(run.step("setObservation", { observation: { ...SCRATCHES, id: "c", voice: "Instinct" } }).status).toBe("refused");
    expect(run.draft().observations).toBeUndefined();
  });

  it("removeObservation removes an accepted line and refuses an unknown id", () => {
    const run = harness(dock());
    run.accept(run.step("setObservation", { observation: SCRATCHES }).id);
    expect(run.step("removeObservation", { id: "nope" }).status).toBe("refused");
    const card = run.step("removeObservation", { id: "scratches" });
    run.accept(card.id);
    expect(run.draft().observations).toBeUndefined();
  });

  it("a line that imposes a feeling is accepted by the tool but warned in Studio", () => {
    const run = harness(dock());
    run.accept(run.step("setObservation", { observation: { ...SCRATCHES, text: "You sense someone forced the lock; you should check inside." } }).id);
    const codes = runDiagnostics(run.draft()).map((entry) => entry.code);
    expect(codes).toContain("observation-imposes-mind");
    expect(codes).toContain("observation-instructs");
  });
});
