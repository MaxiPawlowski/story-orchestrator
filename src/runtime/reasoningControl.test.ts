import type { ModelReply, ModelRequestOptions, ReasoningMeter } from "@services/STAPI";
import { failureClass } from "@extraction/breaker";
import { ModelCallError } from "@extraction/modelError";
import { replyVia } from "@extraction/reply";
import { callTimeoutMs } from "@extraction/callBudget";
import { DEFAULT_REASONING_BUDGET, sanitizeReasoningBudget } from "@utils/reasoningEffort";
import { createModelCallVia, type RoleCallObservation } from "./modelCallCore";
import { resolveRoute, roleEffort, sanitizeRoleRoutes } from "./passProfiles";
import { withRoleEffort } from "./roleRouteEdits";
import { buildRoleRoutes } from "./roleHealth";
import { nextRepairStep } from "./repair";
import { sanitizeGlobalSettings } from "./settingsModel";
import type { RuntimeSnapshot } from "./types";

const meter = (over: Partial<ReasoningMeter> = {}): ReasoningMeter => ({ effort: "low", applied: true, collapsed: false, unsupported: null, budget: 512, chars: 10, tokens: null, ...over });

describe("effort settings: one key per role under extraction.routes (v2.6 plan 05 R1, plan 13 H7 shape)", () => {
  it("keeps a known level, drops default and anything unknown (v2.5 rule 9: no history branches)", () => {
    expect(sanitizeRoleRoutes({ read: { route: { options: { effort: "off" } } }, director: { route: { options: { effort: "default" } } }, curator: { route: { options: { effort: "max" } } }, bogus: { route: { options: { effort: "low" } } } }))
      .toEqual({ read: { route: { options: { effort: "off" } } } });
    expect(sanitizeRoleRoutes({ read: "off" })).toBeUndefined();
    expect(sanitizeRoleRoutes(null)).toBeUndefined();
  });

  it("withRoleEffort sets one role and clears it on default", () => {
    const set = withRoleEffort(undefined, "synthesis", "medium");
    expect(roleEffort({ routes: set }, "synthesis")).toBe("medium");
    expect(roleEffort({ routes: withRoleEffort(set, "synthesis", "default") }, "synthesis")).toBe("default");
  });

  it("the budget clamps each level to a non-negative integer under the cap and fills gaps from the defaults", () => {
    expect(sanitizeReasoningBudget({ low: 100, medium: -1, high: 1e9 })).toEqual({ low: 100, medium: DEFAULT_REASONING_BUDGET.medium, high: DEFAULT_REASONING_BUDGET.high });
    expect(sanitizeReasoningBudget("x")).toBeUndefined();
  });

  it("the global sanitizer carries routes and budget, and never lets a raw key through", () => {
    const settings = sanitizeGlobalSettings({ extraction: { profileId: "m", routes: { read: { route: { options: { effort: "nope" } } } }, reasoningBudget: { low: 64 } } });
    expect(settings.extraction.routes).toBeUndefined();
    expect(settings.extraction.reasoningBudget).toEqual({ ...DEFAULT_REASONING_BUDGET, low: 64 });
    expect(sanitizeGlobalSettings({}).extraction).not.toHaveProperty("routes");
  });

  it("the reply effort keeps a known level and drops anything else (absent reads as medium)", () => {
    for (const level of ["off", "low", "medium", "high"]) expect(sanitizeGlobalSettings({ extraction: { replyEffort: level } }).extraction.replyEffort).toBe(level);
    for (const raw of ["default", "max", 3, null]) expect(sanitizeGlobalSettings({ extraction: { replyEffort: raw } }).extraction).not.toHaveProperty("replyEffort");
    expect(sanitizeGlobalSettings({}).extraction).not.toHaveProperty("replyEffort");
  });

  it("the resolved route carries the role's effort on a role profile and on the fallback alike; default adds no key", () => {
    const routes = withRoleEffort(undefined, "read", "off");
    const settings = { profileId: "memory", profiles: { director: "fast" }, routes: withRoleEffort(routes, "director", "high") };
    expect(resolveRoute(settings, "read", () => true)).toEqual({ ok: true, route: { kind: "profile", profileId: "memory", effort: "off" }, source: "fallback" });
    expect(resolveRoute(settings, "director", () => true)).toEqual({ ok: true, route: { kind: "profile", profileId: "fast", effort: "high" }, source: "role" });
    expect(resolveRoute(settings, "curator", () => true)).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
  });
});

describe("replyVia: the budget, the timeout and inline reasoning (v2.6 plan 05 R2)", () => {
  const transport = (reply: ModelReply) => {
    const seen: Array<{ maxTokens: number; options: ModelRequestOptions }> = [];
    const call = replyVia(async (_id, _prompt, maxTokens, options) => { seen.push({ maxTokens, options }); return reply; });
    return { call, seen };
  };

  it("a level hands the transport the effort and that level's budget; the answer budget stays the caller's", async () => {
    const { call, seen } = transport({ ok: true, text: "x", finish: "stop", meter: meter() });
    await call("p", { kind: "profile", profileId: "m", effort: "high" }, { maxTokens: 512, reasoningBudget: { low: 1, medium: 2, high: 3000 } });
    expect(seen[0].maxTokens).toBe(512);
    expect(seen[0].options).toMatchObject({ effort: "high", reasoningBudget: 3000 });
  });

  it("control: default passes no effort key at all", async () => {
    const { call, seen } = transport({ ok: true, text: "x", finish: "stop", meter: meter({ effort: "default" }) });
    await call("p", { kind: "profile", profileId: "m" }, { maxTokens: 512 });
    expect(seen[0].options).not.toHaveProperty("effort");
    expect(seen[0].options).not.toHaveProperty("reasoningBudget");
  });

  it("the timeout grows with the reasoning budget, because thinking takes time", async () => {
    let signal: AbortSignal | undefined;
    const call = replyVia(async (_id, _prompt, _max, options) => { signal = options.signal; return { ok: true, text: "x", finish: "stop", meter: meter() }; });
    const spy = jest.spyOn(AbortSignal, "timeout");
    await call("p", { kind: "profile", profileId: "m", effort: "medium" }, { maxTokens: 512 });
    expect(spy).toHaveBeenLastCalledWith(callTimeoutMs(512 + DEFAULT_REASONING_BUDGET.medium, 1));
    spy.mockRestore();
    expect(signal).toBeDefined();
  });

  it("a reply that was only an inline think block is reasoning-exhausted, not an empty answer", async () => {
    const { call } = transport({ ok: true, text: "<think>\nThe scene opens in the ruins and", finish: "length", meter: meter({ effort: "default", applied: false, chars: 0 }) });
    await expect(call("p", { kind: "profile", profileId: "m" })).rejects.toMatchObject({ name: "ModelCallError", kind: "reasoning-exhausted", profileId: "m" });
  });

  it("control: an answer after the think block survives with the transport's meter", async () => {
    const { call } = transport({ ok: true, text: "<think>abc</think>NO_DELTA", finish: "stop", meter: meter({ chars: 0 }) });
    const reply = await call("p", { kind: "profile", profileId: "m", effort: "low" });
    expect(reply).toEqual({ text: "NO_DELTA", finish: "stop", meter: meter({ chars: 0 }) });
  });

  it("a transport-reported exhaustion becomes a typed ModelCallError the scheduler does not treat as transport", async () => {
    const { call } = transport({ ok: false, kind: "reasoning-exhausted", message: "spent" });
    const error = await call("p", { kind: "profile", profileId: "m" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelCallError);
    expect(failureClass(error)).toBe("exhausted");
    expect(failureClass(new ModelCallError("transport", "x"))).toBe("transport");
  });
});

describe("the call record per role and the Repair line (v2.6 plan 05 R2)", () => {
  const settings = { profileId: "memory", routes: withRoleEffort(undefined, "director", "high"), reasoningBudget: { low: 1, medium: 2, high: 3 } };

  it("the model call hands its settings' budget to the reply and records each answer against the role", async () => {
    const seen: unknown[] = [];
    const observed: Array<[string, RoleCallObservation]> = [];
    const call = createModelCallVia(async (_prompt, _route, options) => { seen.push(options?.reasoningBudget); return { text: "x", finish: "stop", meter: meter({ effort: "high" }) }; },
      { settings: () => settings, exists: () => true, planted: false, observe: (role, entry) => observed.push([role, entry]) });
    await call("p", { role: "director", pass: "director" });
    expect(seen).toEqual([settings.reasoningBudget]);
    expect(observed).toEqual([["director", { outcome: "answered", profileId: "memory", effort: "high", meter: meter({ effort: "high" }) }]]);
  });

  it("an exhausted call is recorded and still thrown", async () => {
    const observed: RoleCallObservation[] = [];
    const call = createModelCallVia(async () => { throw new ModelCallError("reasoning-exhausted", "spent", "memory"); },
      { settings: () => settings, exists: () => true, planted: false, observe: (_role, entry) => observed.push(entry) });
    await expect(call("p", { role: "director", pass: "director" })).rejects.toMatchObject({ kind: "reasoning-exhausted" });
    expect(observed).toEqual([{ outcome: "reasoning-exhausted", profileId: "memory", effort: "high", detail: "spent" }]);
  });

  it("control: other failures are not recorded as exhaustion", async () => {
    const observed: RoleCallObservation[] = [];
    const call = createModelCallVia(async () => { throw new ModelCallError("transport", "down", "memory"); },
      { settings: () => settings, exists: () => true, planted: false, observe: (_role, entry) => observed.push(entry) });
    await expect(call("p", { role: "director", pass: "director" })).rejects.toMatchObject({ kind: "transport" });
    expect(observed).toEqual([]);
  });

  it("an exhausted role is a Repair row naming the role and both remedies, even on the fallback profile", () => {
    const routes = buildRoleRoutes({ settings, exists: () => true, health: () => null, selfTests: {}, calls: { director: { outcome: "reasoning-exhausted", profileId: "memory", effort: "high", detail: "spent" } } });
    const director = routes.find((route) => route.role === "director");
    expect(director).toMatchObject({ state: "reasoning-exhausted", effort: "high", detail: "The model spent its whole budget thinking — lower the effort for Speaker direction or raise the budget." });
    const snapshot = { storyId: "s", extraction: { settings: { enabled: true, profileId: "memory" } }, roleRoutes: routes, requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] } } as unknown as RuntimeSnapshot;
    expect(nextRepairStep(snapshot)).toMatchObject({ area: "model-role", detail: director?.detail, targetId: "so-role-profile-director" });
  });

  it("control: an exhaustion recorded under another effort or profile no longer shows once the author changed it", () => {
    const calls = { director: { outcome: "reasoning-exhausted" as const, profileId: "memory", effort: "medium" as const, detail: "spent" } };
    expect(buildRoleRoutes({ settings, exists: () => true, health: () => null, selfTests: {}, calls }).find((route) => route.role === "director")?.state).toBe("fallback");
  });

  it("an answered call exposes whether the effort applied, so the row can say the connection cannot change it", () => {
    const calls = { director: { outcome: "answered" as const, profileId: "memory", effort: "high" as const, meter: meter({ effort: "high", applied: false, unsupported: "no lever" }) } };
    expect(buildRoleRoutes({ settings, exists: () => true, health: () => null, selfTests: {}, calls }).find((route) => route.role === "director")?.reasoning).toEqual(meter({ effort: "high", applied: false, unsupported: "no lever" }));
  });
});
