import type { StoryV2 } from "@engine/index";
import { advanceAgent, agentStats, applyAgentOp, approvePlan, decideStep, newAgentSession, opPreview, pendingStep, resolveProvisioning, stopAgent } from "./loop";
import { AgentRouteUnavailable, harnessRoute } from "./route";
import { renderStagePrompt } from "../prompts";
import { agentContext, scriptedRoute } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-09-30T00:00:00.000Z";

const story = (): StoryV2 => ({
  format: 2,
  title: "Flooded Courier",
  description: "",
  qualities: [{ key: "delivered", type: "bool", source: "extractor", rubric: "Has the parcel been handed over?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Take the parcel.", type: "intermediate", start: true },
    { id: "end", name: "Delivery", objective: "Hand it over.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { q: "delivered", op: "==", v: true } }],
  roster: [],
});

const running = (mode: AgentSession["mode"] = "review") => approvePlan({ ...newAgentSession("courier", mode, {}, AT), plan: ["objective"], status: "awaiting-plan" }, ["objective"], AT);

const OBJECTIVE_CALL = { thought: "sharper", tool: "updateCheckpoint", args: { id: "start", patch: { objective: "Take the sealed parcel from the harbour." } } };

describe("agent loop (v2.6 plan 11 A2)", () => {
  it("plans first, and the author's edited plan is what runs", async () => {
    const { route } = scriptedRoute([{ plan: ["qualities", "beats"] }]);
    const planned = await advanceAgent(newAgentSession("courier", "review", {}, AT), agentContext(story()), route, AT);
    expect(planned.session.status).toBe("awaiting-plan");
    const agreed = approvePlan(planned.session, ["beats only"], AT);
    expect(agreed).toMatchObject({ status: "running", plan: ["beats only"] });
    expect(agreed.notes.at(-1)?.text).toContain("Edited the plan");
  });

  it("makes one tool call per step, waits for the author in review mode, and feeds the check back", async () => {
    const { route, prompts } = scriptedRoute([OBJECTIVE_CALL, { done: "objective sharpened" }]);
    const draft = story();
    const step = await advanceAgent(running(), agentContext(draft), route, AT);
    expect(step.apply).toBeNull();
    expect(step.session.status).toBe("awaiting-author");
    const pending = pendingStep(step.session);
    expect(pending).toMatchObject({ family: "edit", status: "pending", firstTryValid: true, route: "local" });
    const decided = decideStep(step.session, pending!.id, { kind: "accept" }, draft);
    expect(decided.apply).toEqual({ kind: "updateCheckpoint", id: "start", patch: { objective: "Take the sealed parcel from the harbour." } });
    expect(decided.session.status).toBe("running");
    expect(decided.session.steps[0].check).toContain("0 validation error(s), 0 blocking");
    const next = await advanceAgent(decided.session, agentContext(applyAgentOp(draft, decided.apply!)), route, AT);
    expect(prompts[1]).toContain("#1 updateCheckpoint → accepted");
    expect(prompts[1]).toContain("check: 0 validation error(s)");
    expect(next.session).toMatchObject({ status: "done", summary: "objective sharpened" });
  });

  it("sends the author's rejection reason back to the agent", async () => {
    const { route, prompts } = scriptedRoute([OBJECTIVE_CALL, { done: "" }]);
    const step = await advanceAgent(running(), agentContext(story()), route, AT);
    const rejected = decideStep(step.session, 1, { kind: "reject", reason: "keep it vague" }, story());
    expect(rejected.apply).toBeNull();
    await advanceAgent(rejected.session, agentContext(story()), route, AT);
    expect(prompts[1]).toContain("author's reason: keep it vague");
  });

  it("applies an edited op only after it passes the same tool check", () => {
    const pending = {
      id: 1, at: AT, route: "local" as const, call: { tool: "updateCheckpoint", args: {} }, family: "edit" as const, status: "pending" as const,
      op: { kind: "updateCheckpoint" as const, id: "start", patch: { objective: "a" } }, observation: "", firstTryValid: true, repaired: false,
    };
    const session: AgentSession = { ...running(), status: "awaiting-author", steps: [pending] };
    const edited = decideStep(session, 1, { kind: "accept", op: { kind: "updateCheckpoint", id: "start", patch: { objective: "b" } } }, story());
    expect(edited.apply).toEqual({ kind: "updateCheckpoint", id: "start", patch: { objective: "b" } });
    expect(edited.session.steps[0].observation).toContain("edited");
  });

  it("writes straight to the draft in auto-draft mode, with the check attached", async () => {
    const { route } = scriptedRoute([OBJECTIVE_CALL]);
    const step = await advanceAgent(running("auto-draft"), agentContext(story()), route, AT);
    expect(step.apply).toMatchObject({ kind: "updateCheckpoint" });
    expect(step.session.steps[0]).toMatchObject({ status: "applied", family: "edit" });
    expect(step.session.status).toBe("running");
  });

  it("answers a read without the author, and a gate replay over a scripted run", async () => {
    const { route } = scriptedRoute([{ tool: "simulateWalk", args: { steps: [{ delivered: false }, { delivered: true }] } }]);
    const step = await advanceAgent(running(), agentContext(story()), route, AT);
    expect(step.session.steps[0]).toMatchObject({ family: "simulate", status: "observed" });
    expect(step.session.steps[0].observation).toBe("1: stays at start\n2: start → end on delivered == true\nends at end");
  });

  it("both wizards ask for each character's drive and per-beat motives, told only to that character (v2.6 plan 06 A)", async () => {
    const { route, prompts } = scriptedRoute([{ plan: ["cast"] }]);
    await advanceAgent(newAgentSession("courier", "review", {}, AT), agentContext(story()), route, AT);
    expect(prompts[0]).toContain("setRosterDrive: what they want across the story");
    expect(prompts[0]).toContain("setCheckpointMotive: what they want");
    expect(prompts[0]).toContain("setChapters");
    const staged = renderStagePrompt("effects", story(), "", []);
    expect(staged).toContain("a one-line drive: what they privately want across it");
    expect(staged).toContain('"drive"?: string');
    expect(staged).toContain("motives?{ roster_id:");
  });

  it("setChapters: applies the chapters and the assignment, previewed as the chapter list", async () => {
    const call = { tool: "setChapters", args: { chapters: [{ id: "act1", title: "Arrival" }, { id: "act2", title: "Delivery", final: true }], assign: { start: "act1", end: "act2" } } };
    const { route } = scriptedRoute([call]);
    const step = await advanceAgent(running("auto-draft"), agentContext(story()), route, AT);
    expect(step.session.steps[0]).toMatchObject({ status: "applied", family: "edit" });
    const next = applyAgentOp(story(), step.apply!);
    expect(next.checkpoints.map((checkpoint) => checkpoint.chapter)).toEqual(["act1", "act2"]);
    expect(opPreview(story(), step.apply!)).toMatchObject({ label: "Chapters: Arrival / Delivery (2 checkpoint(s) assigned)", before: null, after: next.chapters });
  });

  it("setChapters: refuses an assignment to a checkpoint or chapter that is not there", async () => {
    const { route } = scriptedRoute([{ tool: "setChapters", args: { chapters: [{ id: "act1", title: "Arrival" }], assign: { nowhere: "act1", start: "act9" } } }]);
    const step = await advanceAgent(running(), agentContext(story()), route, AT);
    expect(step.session.steps[0]).toMatchObject({ status: "refused", observation: "Refused: 'nowhere' is not a checkpoint; 'act9' is not one of the chapters sent" });
  });

  it("refuses an edit on a target the draft does not have", async () => {
    const { route } = scriptedRoute([{ tool: "updateCheckpoint", args: { id: "nowhere", patch: { objective: "x" } } }]);
    const step = await advanceAgent(running(), agentContext(story()), route, AT);
    expect(step.session.steps[0]).toMatchObject({ status: "refused", observation: 'Refused: checkpoint "nowhere" not found' });
  });

  it("spends one repair pass on an invalid reply, and records a second failure as a refused step", async () => {
    const repaired = scriptedRoute(["not json", OBJECTIVE_CALL]);
    const fixed = await advanceAgent(running(), agentContext(story()), repaired.route, AT);
    expect(fixed.session.steps[0]).toMatchObject({ status: "pending", firstTryValid: false, repaired: true });
    expect(repaired.prompts[1]).toContain("Your reply was invalid");
    const broken = scriptedRoute(["not json", "still not json"]);
    const failed = await advanceAgent(running(), agentContext(story()), broken.route, AT);
    expect(failed.session.steps[0]).toMatchObject({ call: { tool: "(unparsed)" }, status: "refused", firstTryValid: false });
    expect(broken.prompts).toHaveLength(2);
  });

  it("stops at the step cap and on the author's stop", async () => {
    const { route, prompts } = scriptedRoute([OBJECTIVE_CALL]);
    const capped = { ...running(), budget: { maxSteps: 0, maxTokens: 100, usedTokens: 0 } };
    expect((await advanceAgent(capped, agentContext(story()), route, AT)).session.status).toBe("budget");
    expect((await advanceAgent(stopAgent(running()), agentContext(story()), route, AT)).session.status).toBe("stopped");
    expect(prompts).toHaveLength(0);
  });

  it("confirms a provisioning step only through the install's outcome", async () => {
    const { route } = scriptedRoute([{ tool: "createCharacterCard", args: { name: "Mara", description: "A harbour clerk." } }]);
    const step = await advanceAgent(running("auto-draft"), agentContext(story()), route, AT);
    expect(step.apply).toBeNull();
    expect(pendingStep(step.session)).toMatchObject({ family: "provision", status: "pending" });
    const created = resolveProvisioning(step.session, 1, { ok: true, message: 'Created the character card "Mara".' }, story());
    expect(created.steps[0]).toMatchObject({ status: "applied", observation: 'Created the character card "Mara".' });
    expect(agentStats(created)).toMatchObject({ proposed: 1, accepted: 1, firstTryValid: 1 });
  });

  it("previews one op as before and after", () => {
    expect(opPreview(story(), { kind: "setHouseRules", rules: ["No boats."] })).toEqual({ action: "update", label: "Set 1 house rule(s)", before: null, after: ["No boats."] });
  });

  it("refuses the harness route until plan 04 H, and never falls back to the local profile", async () => {
    await expect(advanceAgent(running(), agentContext(story()), harnessRoute(null, []), AT)).rejects.toBeInstanceOf(AgentRouteUnavailable);
  });
});
