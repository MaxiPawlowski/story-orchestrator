jest.mock("@services/STAPI", () => ({ harnessStatusCached: () => null, refreshHarnessStatus: async () => null }));

import type { StoryV2 } from "@engine/index";
import { runAuthoringStage } from "@copilot/authoring";
import { ModelCallError } from "@extraction/modelError";
import { fellBackText, type ExtractionReply, type ModelCall, type ModelRoute } from "@extraction/modelRoute";
import { createModelCallVia } from "./modelCallCore";
import type { ModelCallRecord } from "./modelCallLog";
import { routeMeters, withRoleFallback, withRoleHarness } from "./roleRouteEdits";
import type { RouteSettings } from "./passProfiles";

const HARNESS = "harness:opencode:openai/gpt-6-astra-fast";
const exists = (ids: string[]) => (id: string) => ids.includes(id);
const routed = (fallback: string | null = "deepseek"): RouteSettings => ({
  profileId: "memory",
  routes: withRoleFallback(withRoleHarness(undefined, "authoring", { harness: "opencode", model: "openai/gpt-6-astra-fast" }), "authoring", fallback),
});
const label = (id: string) => (id === "deepseek" ? "deepseek 4.1 flash" : id);

const quotaThenLocal = () => {
  const calls: ModelRoute[] = [];
  const reply = jest.fn(async (_prompt: string, route: ModelRoute | null): Promise<ExtractionReply> => {
    if (route) calls.push(route);
    if (route?.kind === "harness") throw new ModelCallError("quota", "opencode reports its usage limit", HARNESS);
    return { text: "LOCAL", finish: "stop", model: "deepseek-v4-flash" };
  });
  return { reply, calls };
};

const draft = (): StoryV2 => ({
  format: 2, title: "The Redrawn Kingdom", description: "", qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }], transitions: [], roster: [],
});

describe("T6-3-3 MEDIUM: a harness failure that fell back says so, with the reason and the model that answered", () => {
  it("the reply carries where it fell back from, why, and which profile answered", async () => {
    const h = quotaThenLocal();
    const model = createModelCallVia(h.reply, { settings: () => routed(), exists: exists(["memory", "deepseek"]), label, planted: false });
    const answer = await model("p", { role: "authoring", pass: "copilot" });
    expect(answer.fellBack).toEqual({
      from: HARNESS, fromLabel: "opencode · openai/gpt-6-astra-fast", kind: "quota", reason: "opencode reports its usage limit",
      by: "deepseek", label: "deepseek 4.1 flash", model: "deepseek-v4-flash",
    });
    const text = fellBackText(answer.fellBack!);
    expect(text).toContain("opencode · openai/gpt-6-astra-fast");
    expect(text).toContain("opencode reports its usage limit");
    expect(text).toContain("deepseek 4.1 flash (deepseek-v4-flash) answered");
  });

  it("a staged wizard result carries the fallback of the call that produced it", async () => {
    const fellBack = { from: HARNESS, fromLabel: "opencode · openai/gpt-6-astra-fast", kind: "quota", reason: "limit", by: "deepseek", label: "deepseek 4.1 flash", model: null };
    const model: ModelCall = async () => ({ text: "{\"summary\":\"none\",\"ops\":[]}", finish: "stop", fellBack });
    const result = await runAuthoringStage({ draft: draft(), stage: "qualities", message: "", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(result.fellBack).toEqual(fellBack);
  });

  it("a call that answered on its own route carries no fallback", async () => {
    const model: ModelCall = async () => ({ text: "{\"summary\":\"none\",\"ops\":[]}", finish: "stop" });
    const result = await runAuthoringStage({ draft: draft(), stage: "qualities", message: "", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(result.fellBack).toBeUndefined();
  });
});

describe("T6-3-3 MEDIUM: an ask that already knows the harness failed goes straight to On failure", () => {
  it("never calls the harness, records a fallback from it, and says why on the reply", async () => {
    const h = quotaThenLocal();
    const records: ModelCallRecord[] = [];
    const model = createModelCallVia(h.reply, { settings: () => routed(), exists: exists(["memory", "deepseek"]), label, record: (record) => records.push(record), planted: false });
    const answer = await model("p", { role: "authoring", pass: "copilot", onFailure: { kind: "quota", reason: "quota: opencode reports its usage limit" } });
    expect(h.calls.map((route) => route.kind)).toEqual(["profile"]);
    expect(records.map((record) => [record.route, record.result, record.fallbackFrom ?? null])).toEqual([["deepseek", "fallback", HARNESS]]);
    expect(answer.fellBack).toMatchObject({ from: HARNESS, kind: "quota", reason: "quota: opencode reports its usage limit", label: "deepseek 4.1 flash" });
  });

  it("with On failure set to Pause it refuses with the harness's own failure and calls nothing", async () => {
    const h = quotaThenLocal();
    const model = createModelCallVia(h.reply, { settings: () => routed(null), exists: exists(["memory", "deepseek"]), planted: false });
    await expect(model("p", { role: "authoring", pass: "copilot", onFailure: { kind: "quota", reason: "limit" } })).rejects.toMatchObject({ kind: "quota", message: "limit" });
    expect(h.calls).toHaveLength(0);
  });
});

describe("T6-3-3 MEDIUM: the role meter and the call ring agree on a fallback", () => {
  const record = (route: string, result: ModelCallRecord["result"], fallbackFrom?: string): ModelCallRecord => ({
    at: "2026-10-02T20:45:00.000Z", role: "authoring", pass: "copilot", route, result, ms: 80_000, samplers: "not-applied", ...(fallbackFrom ? { fallbackFrom } : {}),
  });

  it("two harness quotas answered by the On failure profile read as two calls that fell back, none failed", () => {
    const ring = [record(HARNESS, "quota"), record("deepseek", "fallback", HARNESS), record(HARNESS, "quota"), record("deepseek", "fallback", HARNESS)];
    expect(routeMeters(ring).find((meter) => meter.route === HARNESS)).toMatchObject({ calls: 2, ok: 0, failed: 0, fallback: 2 });
  });

  it("a fallback that also failed still counts as failed on the harness", () => {
    const ring = [record(HARNESS, "quota"), record("deepseek", "transport", HARNESS), record(HARNESS, "quota"), record("deepseek", "fallback", HARNESS)];
    expect(routeMeters(ring).find((meter) => meter.route === HARNESS)).toMatchObject({ calls: 2, failed: 1, fallback: 1 });
  });
});
