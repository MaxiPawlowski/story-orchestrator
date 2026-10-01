const mockStatus: { value: unknown } = { value: null };
jest.mock("@services/STAPI", () => ({ harnessStatusCached: () => null, refreshHarnessStatus: async () => mockStatus.value }));

import { ModelCallError } from "@extraction/modelError";
import { probeHarness } from "@extraction/harnessReply";
import { replyVia, setAnsweredObserver, type HarnessTransport, type ModelTransport } from "@extraction/reply";
import type { ModelRoute } from "@extraction/modelRoute";
import type { HarnessRequest, ModelReply } from "@services/STAPI";
import { createModelCallVia } from "./modelCallCore";
import type { ModelCallRecord } from "./modelCallLog";
import { acceptModelCall, appendModelCall, MODEL_CALL_LIMIT, sanitizeModelCalls } from "./modelCallLog";
import { routeMeters, withRoleEffort, withRoleFallback, withRoleHarness } from "./roleRouteEdits";
import { resolvedProfileId, resolveRoute, sanitizeRoleRoutes, type RouteSettings } from "./passProfiles";
import { fallbackRoute } from "./harnessFallback";
import { buildRoleRoutes } from "./roleHealth";
import { failureClass } from "@extraction/breaker";
import type { RunOwnership } from "./runToken";

const meter = { effort: "default" as const, applied: false, collapsed: false, unsupported: null, budget: 0, chars: 0, tokens: null };
const exists = (ids: string[]) => (id: string) => ids.includes(id);
const routed = (extra: Partial<RouteSettings> = {}): RouteSettings => ({
  profileId: "memory",
  routes: withRoleFallback(withRoleHarness(undefined, "synthesis", { harness: "claude", model: "sonnet" }), "synthesis", "local"),
  ...extra,
});

describe("H1: the route type", () => {
  it("an unset role asks the memory profile; a harness role resolves to its harness route", () => {
    const settings = routed();
    expect(resolveRoute(settings, "read", exists(["memory"]))).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
    expect(resolveRoute(settings, "synthesis", exists(["memory"]))).toEqual({ ok: true, route: { kind: "harness", harness: "claude", model: "sonnet", options: {} }, source: "role" });
    expect(resolvedProfileId(resolveRoute(settings, "synthesis", exists([])))).toBe("harness:claude:sonnet");
  });

  it("a harness route wins over a profile set for the same role, and carries effort and options", () => {
    const routes = withRoleEffort(withRoleHarness(undefined, "read", { harness: "opencode", model: "openai/gpt-6-astra" }), "read", "high");
    const settings: RouteSettings = { profileId: "memory", profiles: { read: "fast" }, routes: sanitizeRoleRoutes({ read: { ...routes.read, route: { ...routes.read?.route, options: { effort: "high", timeoutScale: 2 } } } }) };
    expect(resolveRoute(settings, "read", exists(["fast"]))).toEqual({
      ok: true, route: { kind: "harness", harness: "opencode", model: "openai/gpt-6-astra", effort: "high", options: { effort: "high", timeoutScale: 2 } }, source: "role",
    });
  });

  it("a harness model the plugin does not list is refused as config and named; an unknown status does not refuse", () => {
    const refused = resolveRoute(routed(), "synthesis", exists([]), () => false);
    expect(refused).toMatchObject({ ok: false, profileId: "harness:claude:sonnet" });
    expect(refused.ok ? "" : refused.reason).toContain("harness:claude:sonnet is not offered");
    expect(resolveRoute(routed(), "synthesis", exists([]), () => null).ok).toBe(true);
  });

  it("sanitizes the route: bad harnesses dropped, the fallback kept only with a harness, effort-only rows unchanged", () => {
    expect(sanitizeRoleRoutes({
      read: { route: { kind: "harness", harness: "gemini", model: "x", options: {} }, onFailure: { profileId: "local" } },
      synthesis: { route: { kind: "harness", harness: "codex", model: "default; rm", options: {} } },
      curator: { route: { options: { effort: "low" } }, onFailure: { profileId: "local" } },
      director: { route: { kind: "harness", harness: "claude", model: "haiku", options: { timeoutScale: 99 } }, onFailure: { profileId: " local " } },
    })).toEqual({
      curator: { route: { options: { effort: "low" } } },
      director: { route: { kind: "harness", harness: "claude", model: "haiku", options: {} }, onFailure: { profileId: "local" } },
    });
  });

  it("switching a role back to its profile keeps its effort and drops the harness fallback", () => {
    const routes = withRoleEffort(routed().routes, "synthesis", "medium");
    const back = withRoleHarness(routes, "synthesis", null);
    expect(back.synthesis).toEqual({ route: { options: { effort: "medium" } } });
    expect(fallbackRoute({ profileId: "memory", routes: back }, "synthesis", exists(["local"]))).toBeNull();
    expect(fallbackRoute(routed(), "synthesis", exists(["local"]))).toEqual({ kind: "profile", profileId: "local" });
    expect(fallbackRoute(routed(), "synthesis", exists([]))).toBeNull();
  });
});

const harnessAnswer = (reply: ModelReply) => jest.fn<Promise<ModelReply>, [HarnessRequest]>(async () => reply);

describe("H1/H3: the transport dispatches on the route kind", () => {
  const profile: ModelTransport = async () => ({ ok: true, text: "PROFILE", finish: "stop", meter });

  it("a harness route goes to the harness transport, with the role, the bound and a spawn-padded deadline", async () => {
    const harness = harnessAnswer({ ok: true, text: "PONG", finish: "stop", meter, usage: { input: 400, output: 3, costUsd: null }, spawnMs: 12 });
    const answered: string[] = [];
    const dispose = setAnsweredObserver((call) => answered.push(call.profileId));
    const reply = await replyVia(profile, harness)("prompt", { kind: "harness", harness: "claude", model: "haiku", effort: "high" }, { maxTokens: 100, role: "synthesis" });
    dispose();
    expect(reply).toMatchObject({ text: "PONG", usage: { input: 400 }, spawnMs: 12 });
    const request = harness.mock.calls[0][0];
    expect(request).toMatchObject({ harness: "claude", model: "haiku", role: "synthesis", effort: "high", prompt: "prompt", maxOutputChars: 600 });
    expect(request.timeoutMs).toBeGreaterThan(15_000);
    expect(answered).toEqual(["harness:claude:haiku"]);
  });

  it("a harness failure is a ModelCallError keyed on the route, carrying the quota's retry time", async () => {
    const retryAt = Date.now() + 3_600_000;
    const call = replyVia(profile, harnessAnswer({ ok: false, kind: "quota", message: "usage limit", retryAt }));
    await expect(call("p", { kind: "harness", harness: "codex", model: "default" })).rejects.toMatchObject({ kind: "quota", profileId: "harness:codex:default", retryAt });
    await expect(replyVia(profile, harnessAnswer({ ok: true, text: "  ", finish: "stop", meter }))("p", { kind: "harness", harness: "codex", model: "default" })).rejects.toMatchObject({ kind: "malformed" });
  });

  it("negative control: a debug response answers first and the harness transport is never asked", async () => {
    const harness = harnessAnswer({ ok: true, text: "never", finish: "stop", meter });
    const model = createModelCallVia(replyVia(profile, harness), { settings: () => routed(), exists: exists(["memory", "local"]) });
    await expect(model("p", { role: "synthesis", pass: "canon", debugResponse: "PLANTED" })).resolves.toMatchObject({ text: "PLANTED" });
    expect(harness).not.toHaveBeenCalled();
  });
});

describe("H1/H4: no silent fallback, and every call recorded with its route", () => {
  const failing = (kind: ModelCallError["kind"]) => {
    const calls: ModelRoute[] = [];
    const reply = jest.fn(async (_prompt: string, route: ModelRoute | null) => {
      if (route) calls.push(route);
      if (route?.kind === "harness") throw new ModelCallError(kind, `${kind} happened`, "harness:claude:sonnet");
      return { text: "LOCAL", finish: "stop" as const };
    });
    const records: ModelCallRecord[] = [];
    const observed: string[] = [];
    return { reply, calls, records, observed };
  };

  it.each(["auth", "quota", "transport", "timeout"] as const)("%s falls back to the author's own profile, recorded as a fallback", async (kind) => {
    const h = failing(kind);
    const model = createModelCallVia(h.reply, { settings: () => routed(), exists: exists(["memory", "local"]), record: (record) => h.records.push(record), planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).resolves.toMatchObject({ text: "LOCAL" });
    expect(h.calls.map((route) => route.kind)).toEqual(["harness", "profile"]);
    expect(h.records.map((record) => [record.route, record.result, record.fallbackFrom ?? null])).toEqual([
      ["harness:claude:sonnet", kind, null], ["local", "fallback", "harness:claude:sonnet"],
    ]);
    expect(h.records.map((record) => record.samplers)).toEqual(["not-applied", "applied"]);
  });

  it.each(["config", "refused", "malformed", "lapsed"] as const)("%s never falls back", async (kind) => {
    const h = failing(kind);
    const model = createModelCallVia(h.reply, { settings: () => routed(), exists: exists(["memory", "local"]), record: (record) => h.records.push(record), planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).rejects.toMatchObject({ kind });
    expect(h.calls).toHaveLength(1);
    expect(h.records.map((record) => record.result)).toEqual([kind]);
  });

  it("with no fallback chosen the role pauses: the failure is thrown, never answered from the memory profile", async () => {
    const h = failing("transport");
    const settings = { ...routed(), routes: withRoleFallback(routed().routes, "synthesis", null) };
    const model = createModelCallVia(h.reply, { settings: () => settings, exists: exists(["memory", "local"]), planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).rejects.toMatchObject({ kind: "transport" });
    expect(h.calls).toHaveLength(1);
  });

  it("an auth failure is observed for the role's Repair row", async () => {
    const h = failing("auth");
    const observations: unknown[] = [];
    const settings = { ...routed(), routes: withRoleFallback(routed().routes, "synthesis", null) };
    const model = createModelCallVia(h.reply, { settings: () => settings, exists: exists(["memory"]), planted: false, observe: (_role, call) => observations.push(call) });
    await expect(model("p", { role: "synthesis", pass: "canon" })).rejects.toBeInstanceOf(ModelCallError);
    expect(observations).toEqual([{ outcome: "auth", profileId: "harness:claude:sonnet", effort: "default", detail: "auth happened" }]);
    const [synthesis] = buildRoleRoutes({ settings, exists: exists(["memory"]), health: () => null, selfTests: {}, calls: { synthesis: observations[0] as never } }).filter((route) => route.role === "synthesis");
    expect(synthesis).toMatchObject({ state: "not-logged-in", profileId: "harness:claude:sonnet", detail: "Summaries and canon: auth happened" });
  });
});

describe("H4: the call ring and the meter", () => {
  const record = (route: string, result: ModelCallRecord["result"], tokens = 10): ModelCallRecord => ({
    at: "2026-09-30T12:00:00.000Z", role: "read", pass: "read", route, result, ms: 5, usage: { input: tokens, output: 1, costUsd: null }, samplers: "not-applied",
  });

  it("caps at 300 and drops malformed rows on hydrate", () => {
    let ring: ModelCallRecord[] = [];
    for (let index = 0; index < MODEL_CALL_LIMIT + 5; index += 1) ring = appendModelCall(ring, record("harness:claude:haiku", "ok"));
    expect(ring).toHaveLength(MODEL_CALL_LIMIT);
    expect(sanitizeModelCalls([record("a", "ok"), { at: "x" }, null])).toHaveLength(1);
  });

  it("meters per route and keeps a fallback apart from a failure", () => {
    expect(routeMeters([record("h", "ok", 100), record("h", "quota", 0), record("local", "fallback", 7)])).toEqual([
      { route: "h", calls: 2, ok: 1, failed: 1, fallback: 0, inputTokens: 100, outputTokens: 2, costUsd: 0, unknownUsage: 0 },
      { route: "local", calls: 1, ok: 0, failed: 0, fallback: 1, inputTokens: 7, outputTokens: 1, costUsd: 0, unknownUsage: 0 },
    ]);
  });
});

describe("H3: a harness breaker is probed by status, never by a model call", () => {
  const row = (extra: Record<string, unknown> = {}) => ({ installed: true, offered: true, fresh: true, quotaUntil: null, models: [], ...extra });
  it("closes only when the harness is installed, offered, logged in and not held by a usage limit", async () => {
    mockStatus.value = { harnesses: { claude: row() } };
    await expect(probeHarness("harness:claude:haiku")).resolves.toEqual({ ok: true });
    mockStatus.value = { harnesses: { claude: row({ fresh: false, loginProblem: "run `claude` once" }) } };
    await expect(probeHarness("harness:claude:haiku")).resolves.toEqual({ ok: false, kind: "transport", message: "run `claude` once" });
    mockStatus.value = { harnesses: { claude: row({ quotaUntil: Date.now() + 60_000 }) } };
    await expect(probeHarness("harness:claude:haiku")).resolves.toMatchObject({ ok: false, message: expect.stringContaining("usage limit") });
    mockStatus.value = { harnesses: { claude: row({ offered: false }) } };
    await expect(probeHarness("harness:claude:haiku")).resolves.toMatchObject({ ok: false, kind: "config" });
    mockStatus.value = null;
    await expect(probeHarness("harness:claude:haiku")).resolves.toMatchObject({ ok: false, kind: "transport" });
  });
});

describe("review fixes CR-J (harness routing)", () => {
  const row = (extra: Record<string, unknown> = {}) => ({ installed: true, offered: true, fresh: true, quotaUntil: null, models: [], ...extra });

  it("CR-J6: a held harness and an unwarmed opencode cache keep the breaker open as config", async () => {
    mockStatus.value = { harnesses: { opencode: row({ blocked: "opencode's real login file changed during a call" }) } };
    await expect(probeHarness("harness:opencode:openai/gpt-6-astra")).resolves.toEqual({ ok: false, kind: "config", message: "opencode's real login file changed during a call" });
    mockStatus.value = { harnesses: { opencode: row({ cacheWarm: false }) } };
    await expect(probeHarness("harness:opencode:openai/gpt-6-astra")).resolves.toMatchObject({ ok: false, kind: "config", message: expect.stringContaining("not warmed") });
    mockStatus.value = { harnesses: { opencode: row({ cacheWarm: true, blocked: null }) } };
    await expect(probeHarness("harness:opencode:openai/gpt-6-astra")).resolves.toEqual({ ok: true });
  });

  it("CR-J8: busy is its own failure class: it never trips the breaker and never falls back", async () => {
    expect(failureClass(new ModelCallError("busy", "queued", "harness:claude:sonnet"))).toBe("busy");
    const calls: ModelRoute[] = [];
    const reply = jest.fn(async (_prompt: string, route: ModelRoute | null) => {
      if (route) calls.push(route);
      if (route?.kind === "harness") throw new ModelCallError("busy", "queued", "harness:claude:sonnet");
      return { text: "LOCAL", finish: "stop" as const };
    });
    const model = createModelCallVia(reply, { settings: () => routed(), exists: exists(["memory", "local"]), planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).rejects.toMatchObject({ kind: "busy" });
    expect(calls.map((route) => route.kind)).toEqual(["harness"]);
  });

  it("CR-J10: a fallback that fails is recorded on its own route, with the route it fell back from", async () => {
    const records: ModelCallRecord[] = [];
    const reply = jest.fn(async (_prompt: string, route: ModelRoute | null) => {
      if (route?.kind === "harness") throw new ModelCallError("quota", "limit", "harness:claude:sonnet");
      throw new ModelCallError("transport", "the local profile is down", "local");
    });
    const model = createModelCallVia(reply, { settings: () => routed(), exists: exists(["memory", "local"]), record: (record) => records.push(record), planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).rejects.toMatchObject({ kind: "transport", message: "the local profile is down" });
    expect(records.map((record) => [record.route, record.result, record.fallbackFrom ?? null])).toEqual([
      ["harness:claude:sonnet", "quota", null], ["local", "transport", "harness:claude:sonnet"],
    ]);
  });

  it("CR-J15: a call that lands after its chat went away records nothing in the new chat's ring", async () => {
    const records: ModelCallRecord[] = [];
    let epoch = 1;
    const ownership = {
      mint: () => ({ epoch }) as never,
      check: (token: never) => ((token as { epoch: number }).epoch === epoch ? { ok: true as const } : { ok: false as const, reason: "epoch" as const }),
    } as unknown as RunOwnership;
    const reply = jest.fn(async () => {
      epoch += 1;
      return { text: "ANSWER", finish: "stop" as const };
    });
    const settings = { ...routed(), routes: withRoleFallback(routed().routes, "synthesis", null) };
    const model = createModelCallVia(reply, { settings: () => settings, exists: exists(["memory"]), record: (record) => records.push(record), ownership, planted: false });
    await expect(model("p", { role: "synthesis", pass: "canon" })).resolves.toMatchObject({ text: "ANSWER" });
    expect(records).toEqual([]);
    const steady = jest.fn(async () => ({ text: "ANSWER", finish: "stop" as const }));
    const control = createModelCallVia(steady, { settings: () => settings, exists: exists(["memory"]), record: (record) => records.push(record), ownership, planted: false });
    await control("p", { role: "synthesis", pass: "canon" });
    expect(records.map((record) => record.result)).toEqual(["ok"]);
  });
});

describe("AS-9: a harness call that lands after a chat switch", () => {
  it("writes no telemetry into the chat now open, from the success path or the failure path", async () => {
    const context = { chatId: "chat-a", epoch: 1 };
    const ownership = {
      mint: () => ({ chatId: context.chatId, epoch: context.epoch }) as never,
      check: (token: never) => ((token as { epoch: number }).epoch === context.epoch ? { ok: true as const } : { ok: false as const, reason: "chat" as const }),
    } as unknown as RunOwnership;
    const rings: Record<string, ModelCallRecord[]> = { "chat-a": [], "chat-b": [] };
    const record = (row: ModelCallRecord) => { rings[context.chatId] = acceptModelCall(rings[context.chatId], row, context.chatId); };
    const switchChat = () => { context.chatId = "chat-b"; context.epoch += 1; };
    const settings = { ...routed(), routes: withRoleFallback(routed().routes, "synthesis", null) };
    const deps = { settings: () => settings, exists: exists(["memory"]), record, ownership, planted: false, stamp: () => ({ chatId: context.chatId, messageId: 4 }) };
    const answered = createModelCallVia(async (_prompt, route) => {
      expect(route?.kind).toBe("harness");
      switchChat();
      return { text: "ANSWER", finish: "stop" as const, usage: { input: 3, output: 2, costUsd: null } };
    }, deps);
    await expect(answered("p", { role: "synthesis", pass: "canon" })).resolves.toMatchObject({ text: "ANSWER" });
    const failed = createModelCallVia(async () => {
      switchChat();
      throw new ModelCallError("timeout", "late", "harness:claude:sonnet");
    }, deps);
    await expect(failed("p", { role: "synthesis", pass: "canon" })).rejects.toThrow("late");
    expect(rings).toEqual({ "chat-a": [], "chat-b": [] });
  });

  it("control: an unmoved chat records the harness call in its own ring", async () => {
    const rings: ModelCallRecord[] = [];
    const ownership = { mint: () => ({}) as never, check: () => ({ ok: true as const }) } as unknown as RunOwnership;
    const settings = { ...routed(), routes: withRoleFallback(routed().routes, "synthesis", null) };
    const model = createModelCallVia(async () => ({ text: "ANSWER", finish: "stop" as const }), {
      settings: () => settings, exists: exists(["memory"]), record: (row) => rings.push(row), ownership, planted: false, stamp: () => ({ chatId: "chat-a", messageId: 4 }),
    });
    await model("p", { role: "synthesis", pass: "canon" });
    expect(rings).toEqual([expect.objectContaining({ route: "harness:claude:sonnet", chatId: "chat-a", result: "ok" })]);
  });
});
