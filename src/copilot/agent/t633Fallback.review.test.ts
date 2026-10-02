import type { StoryV2 } from "@engine/index";
import type { ExtractionReply, ModelAsk, ModelCall } from "@extraction/modelRoute";
import { ModelCallError } from "@extraction/modelError";
import { emptyEnvironment } from "@wizard/index";
import { newAgentSession } from "./loop";
import { AgentRouteUnavailable, type AgentToolBridge } from "./route";
import { createAgentRunner } from "./turn";

const AT = "2026-10-02T20:30:00.000Z";
const TARGET = { harness: "opencode", model: "openai/gpt-6-astra-fast", timeoutMs: 600_000 };
const FELL_BACK = { from: "harness:opencode:openai/gpt-6-astra-fast", fromLabel: "opencode · openai/gpt-6-astra-fast", kind: "quota", reason: "", by: "deepseek", label: "deepseek 4.1 flash", model: "deepseek-v4-flash" };

const story = (): StoryV2 => ({
  format: 2, title: "Fallback", description: "", qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }], transitions: [], roster: [],
});

const quotaBridge = (kind = "quota", message = "opencode reports its usage limit") => {
  const opened: string[] = [];
  const bridge: AgentToolBridge = {
    open: async () => {
      opened.push("open");
      return { ok: false, kind, message };
    },
    nextCall: async () => ({ kind: "ended", errorKind: "timeout", message: "unused" }),
    answer: async () => true,
    close: async () => undefined,
  };
  return { bridge, opened };
};

const onFailureModel = () => {
  const asks: ModelAsk[] = [];
  const call: ModelCall = async (_prompt, ask): Promise<ExtractionReply> => {
    asks.push(ask);
    if (!ask.onFailure) throw new ModelCallError("quota", "the harness again", "harness:opencode:openai/gpt-6-astra-fast");
    return { text: JSON.stringify({ plan: ["Add the qualities"] }), finish: "stop", fellBack: { ...FELL_BACK, reason: ask.onFailure.reason } };
  };
  return { call, asks };
};

describe("T6-3-3 MEDIUM: the Agent entry honours the role's On failure profile", () => {
  it("a harness quota falls back to the On failure profile, visibly, and the next turn stays there", async () => {
    const { bridge, opened } = quotaBridge();
    const model = onFailureModel();
    const runner = createAgentRunner({ model: model.call, environment: () => emptyEnvironment(), harness: async () => ({ bridge, target: TARGET, fallback: true }) });
    const turn = await runner(newAgentSession("map", "review", {}, AT), story());
    expect(turn.session.status).toBe("awaiting-plan");
    expect(turn.session.plan).toEqual(["Add the qualities"]);
    expect(model.asks[0].onFailure).toEqual({ kind: "quota", reason: "quota: opencode reports its usage limit" });
    expect(turn.session.fallback).toContain("opencode · openai/gpt-6-astra-fast could not answer (quota: opencode reports its usage limit)");
    expect(turn.session.fallback).toContain("deepseek 4.1 flash (deepseek-v4-flash) answered");
    await runner({ ...turn.session, status: "running", plan: ["Add the qualities"] }, story());
    expect(opened).toHaveLength(1);
    expect(model.asks.every((ask) => ask.onFailure)).toBe(true);
  });

  it("with On failure set to Pause the harness failure stops the agent with its reason", async () => {
    const { bridge } = quotaBridge();
    const model = onFailureModel();
    const runner = createAgentRunner({ model: model.call, environment: () => emptyEnvironment(), harness: async () => ({ bridge, target: TARGET }) });
    await expect(runner(newAgentSession("map", "review", {}, AT), story())).rejects.toMatchObject({ message: "quota: opencode reports its usage limit" });
    expect(model.asks).toHaveLength(0);
  });

  it("a refusal that is a setup problem never falls back", async () => {
    const model = onFailureModel();
    const runner = createAgentRunner({ model: model.call, environment: () => emptyEnvironment(), harness: async () => ({ refusal: "opencode offers no agent tool bridge", fallback: true }) });
    await expect(runner(newAgentSession("map", "review", {}, AT), story())).rejects.toBeInstanceOf(AgentRouteUnavailable);
    const { bridge } = quotaBridge("config", "opencode is not offered");
    const configured = createAgentRunner({ model: model.call, environment: () => emptyEnvironment(), harness: async () => ({ bridge, target: TARGET, fallback: true }) });
    await expect(configured(newAgentSession("map", "review", {}, AT), story())).rejects.toMatchObject({ message: "config: opencode is not offered" });
    expect(model.asks).toHaveLength(0);
  });
});
