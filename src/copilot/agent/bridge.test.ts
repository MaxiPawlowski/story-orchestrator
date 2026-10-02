import type { StoryV2 } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { BRIDGE_ROLE, BRIDGE_SYSTEM, bridgeAnswerText, createBridgeRoute, harnessRoute, HARNESS_ROUTE_REFUSAL } from "./bridge";
import { createAgentRunner } from "./turn";
import { advanceAgent, approvePlan, decideStep, newAgentSession, pendingStep, type AgentTurn } from "./loop";
import { AgentRouteUnavailable, type AgentBridgeEvent, type AgentToolBridge } from "./route";
import { agentContext } from "./testing";
import { agentToolSchemas } from "./turn";
import type { AgentMode } from "./types";

const AT = "2026-09-30T00:00:00.000Z";
const TARGET = { harness: "opencode", model: "openai/gpt-6-astra-fast", timeoutMs: 600_000 };

const story = (): StoryV2 => ({
  format: 2,
  title: "Bridge",
  description: "",
  qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const running = (mode: AgentMode = "review") => approvePlan({ ...newAgentSession("bridge", mode, {}, AT), plan: ["p"], status: "awaiting-plan" }, ["p"], AT);

interface FakeBridge extends AgentToolBridge {
  opened: Array<Parameters<AgentToolBridge["open"]>[0]>;
  answers: Array<{ sessionId: string; callId: string; ok: boolean; text: string }>;
  closed: string[];
}

const fakeBridge = (events: AgentBridgeEvent[], refuse: { kind: string; message: string } | null = null): FakeBridge => {
  const queue = [...events];
  let sessions = 0;
  const bridge: FakeBridge = {
    opened: [],
    answers: [],
    closed: [],
    open: async (input) => {
      bridge.opened.push(input);
      if (refuse) return { ok: false, ...refuse };
      sessions += 1;
      return { ok: true, sessionId: `s${sessions}` };
    },
    nextCall: async () => queue.shift() ?? { kind: "ended", errorKind: "timeout", message: "nothing scripted" },
    answer: async (sessionId, callId, result) => {
      bridge.answers.push({ sessionId, callId, ...result });
      return true;
    },
    close: async (sessionId) => {
      bridge.closed.push(sessionId);
    },
  };
  return bridge;
};

const call = (callId: string, tool: string, args: Record<string, unknown> = {}): AgentBridgeEvent => ({ kind: "call", callId, tool, args });

const settled = async (turn: AgentTurn, route: ReturnType<typeof createBridgeRoute>) => {
  await route.settle?.(turn);
  return turn;
};

describe("agent tool bridge route (v2.6 plan 04 H, option 2)", () => {
  it("opens one session with the tools and the native prompt, observes a read, keeps the session, and answers the shim", async () => {
    const bridge = fakeBridge([call("c1", "readStory"), { kind: "done", text: "{\"done\": \"read it\"}" }]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const first = await settled(await advanceAgent(running(), agentContext(story()), route, AT), route);
    expect(first.session.steps[0]).toMatchObject({ family: "read", status: "observed", route: "harness", firstTryValid: true });
    expect(bridge.opened).toHaveLength(1);
    expect(bridge.opened[0]).toMatchObject({ harness: "opencode", model: TARGET.model, role: BRIDGE_ROLE, system: BRIDGE_SYSTEM });
    expect(bridge.opened[0].prompt).toContain("Call the tools natively");
    expect(bridge.opened[0].prompt).not.toContain("REPLY NOW with one tool call");
    expect(bridge.opened[0].tools.map((tool) => tool.name)).toEqual(agentToolSchemas().map((tool) => tool.name));
    expect(bridge.answers).toEqual([{ sessionId: "s1", callId: "c1", ok: true, text: expect.stringContaining("observed:") }]);
    expect(bridge.closed).toEqual([]);
    const second = await settled(await advanceAgent(first.session, agentContext(story()), route, AT), route);
    expect(bridge.opened).toHaveLength(1);
    expect(second.session).toMatchObject({ status: "done", summary: expect.stringContaining("read it") });
  });

  it("refuses an unknown tool call through checkToolCall, tells the shim so, and writes nothing", async () => {
    const bridge = fakeBridge([call("c1", "writeFile", { path: "/etc/passwd", content: "x" })]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await settled(await advanceAgent(running("auto-draft"), agentContext(story()), route, AT), route);
    expect(turn.apply).toBeNull();
    expect(turn.session.steps[0]).toMatchObject({ status: "refused", family: null, firstTryValid: false });
    expect(bridge.answers[0]).toMatchObject({ callId: "c1", ok: false, text: expect.stringContaining("Refused: unknown tool") });
  });

  it("an edit in review mode waits for the author: the shim is told, and the session closes", async () => {
    const bridge = fakeBridge([call("c1", "updateCheckpoint", { id: "start", patch: { objective: "Begin at the harbour." } })]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await settled(await advanceAgent(running(), agentContext(story()), route, AT), route);
    expect(turn.apply).toBeNull();
    expect(turn.session.status).toBe("awaiting-author");
    expect(bridge.answers[0].text).toContain("pending: Waiting for the author.");
    expect(bridge.closed).toEqual(["s1"]);
  });

  it("an auto-draft edit goes through the mutation path and is returned for the draft", async () => {
    const bridge = fakeBridge([call("c1", "updateCheckpoint", { id: "start", patch: { objective: "Begin at the harbour." } })]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await settled(await advanceAgent(running("auto-draft"), agentContext(story()), route, AT), route);
    expect(turn.apply).toEqual({ kind: "updateCheckpoint", id: "start", patch: { objective: "Begin at the harbour." } });
    expect(bridge.answers[0]).toMatchObject({ ok: true, text: expect.stringContaining("applied: Applied to the draft") });
    expect(bridge.closed).toEqual([]);
  });

  it("a provisioning call waits for the author in every mode, and no draft decision can create the asset", async () => {
    const env = { ...emptyEnvironment(), characterNames: ["Existing Hero"] };
    const bridge = fakeBridge([call("c1", "createStoryLorebook", { name: "Bridge Lore" })]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await settled(await advanceAgent(running("auto-draft"), agentContext(story(), env), route, AT), route);
    expect(turn.apply).toBeNull();
    const pending = pendingStep(turn.session);
    expect(pending).toMatchObject({ family: "provision", status: "pending" });
    expect(bridge.answers[0].text).toContain("Waiting for the author to confirm this asset.");
    expect(bridge.closed).toEqual(["s1"]);
    expect(decideStep(turn.session, pending!.id, { kind: "accept" }, story()).apply).toBeNull();
  });

  it("a tool call while the plan is due is refused, and the session closes", async () => {
    const bridge = fakeBridge([call("c1", "readStory")]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await settled(await advanceAgent(newAgentSession("bridge", "review", {}, AT), agentContext(story()), route, AT), route);
    expect(turn.session.status).toBe("planning");
    expect(turn.session.steps[0]).toMatchObject({ status: "refused", call: { tool: "(unparsed)" } });
    expect(bridge.answers[0]).toMatchObject({ ok: false });
    expect(bridge.closed).toEqual(["s1"]);
  });

  it("the plan arrives as text when the harness ends its turn", async () => {
    const bridge = fakeBridge([{ kind: "done", text: "{\"plan\": [\"qualities\", \"beats\"]}" }]);
    const route = createBridgeRoute(bridge, TARGET, agentToolSchemas());
    const turn = await advanceAgent(newAgentSession("bridge", "review", {}, AT), agentContext(story()), route, AT);
    expect(turn.session).toMatchObject({ status: "awaiting-plan", plan: ["qualities", "beats"] });
  });

  it("a refused open or an ended session is an error, never a fallback to another route", async () => {
    const refused = createBridgeRoute(fakeBridge([], { kind: "auth", message: "opencode is not logged in" }), TARGET, agentToolSchemas());
    await expect(advanceAgent(running(), agentContext(story()), refused, AT)).rejects.toThrow("auth: opencode is not logged in");
    const ended = createBridgeRoute(fakeBridge([{ kind: "ended", errorKind: "refused", message: "a foreign tool" }]), TARGET, agentToolSchemas());
    await expect(advanceAgent(running(), agentContext(story()), ended, AT)).rejects.toBeInstanceOf(AgentRouteUnavailable);
  });

  it("harnessRoute takes the bridge only when the transport carries one and its target", async () => {
    expect(harnessRoute({ bridge: fakeBridge([]), target: TARGET }, []).native).toBe(true);
    const text = harnessRoute({ call: async () => "{\"plan\": [\"x\"]}" }, []);
    expect(text.native).toBeUndefined();
    const planned = await advanceAgent(newAgentSession("bridge", "review", {}, AT), agentContext(story()), text, AT);
    expect(planned.session.plan).toEqual(["x"]);
    await expect(harnessRoute({}, []).ask("p", "plan")).rejects.toThrow(HARNESS_ROUTE_REFUSAL);
  });

  it("bridgeAnswerText reports status, observation and the check", () => {
    expect(bridgeAnswerText(undefined)).toEqual({ ok: false, text: "No step was recorded for this call." });
  });

  it("the runner resolves the route once, settles through it, and closes it", async () => {
    const bridge = fakeBridge([call("c1", "readStory"), call("c2", "readStory")]);
    let resolved = 0;
    const runner = createAgentRunner({
      model: async () => ({ text: "", finish: "stop" }),
      environment: () => emptyEnvironment(),
      harness: async () => { resolved += 1; return { bridge, target: TARGET }; },
    });
    const one = await runner(running(), story());
    await runner.settle?.(one);
    const two = await runner(one.session, story());
    await runner.settle?.(two);
    await runner.close?.();
    expect(resolved).toBe(1);
    expect(bridge.opened).toHaveLength(1);
    expect(bridge.answers.map((entry) => entry.callId)).toEqual(["c1", "c2"]);
    expect(bridge.closed).toEqual(["s1"]);
  });

  it("with no bridge offered the runner keeps the local text route", async () => {
    const prompts: string[] = [];
    const runner = createAgentRunner({
      model: async (prompt) => { prompts.push(prompt); return { text: "{\"plan\": [\"local\"]}", finish: "stop" }; },
      environment: () => emptyEnvironment(),
      harness: async () => null,
    });
    const turn = await runner(newAgentSession("bridge", "review", {}, AT), story());
    expect(turn.session.plan).toEqual(["local"]);
    expect(prompts[0]).toContain("TOOLS");
  });

  it("CR-J7: a harness refusal reaches the wizard, the local model is never asked, and the refusal is not memoized", async () => {
    const prompts: string[] = [];
    const bridge = fakeBridge([{ kind: "done", text: "{\"plan\": [\"bridged\"]}" }]);
    const answers: Array<{ refusal: string } | { bridge: FakeBridge; target: typeof TARGET }> = [{ refusal: "the harness plugin did not answer its status" }, { bridge, target: TARGET }];
    let resolved = 0;
    const runner = createAgentRunner({
      model: async (prompt) => { prompts.push(prompt); return { text: "{\"plan\": [\"local\"]}", finish: "stop" }; },
      environment: () => emptyEnvironment(),
      harness: async () => { resolved += 1; return answers.shift() ?? null; },
    });
    const session = newAgentSession("bridge", "review", {}, AT);
    const refused = runner(session, story());
    await expect(refused).rejects.toBeInstanceOf(AgentRouteUnavailable);
    await expect(refused).rejects.toThrow("did not answer its status");
    expect(prompts).toEqual([]);
    const turn = await runner(session, story());
    expect(resolved).toBe(2);
    expect(turn.session.plan).toEqual(["bridged"]);
    await runner(turn.session, story()).catch(() => undefined);
    expect(resolved).toBe(2);
  });
});
