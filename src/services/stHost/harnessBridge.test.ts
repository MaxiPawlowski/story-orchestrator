jest.mock("./context", () => ({ getContext: () => ({ getRequestHeaders: () => ({ "X-CSRF-Token": "t" }) }) }));

import { createHarnessBridgeClient, readBridgeEvent } from "./harnessBridge";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const scripted = (answers: Response[]) => {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown>, headers: init.headers as Record<string, string> });
    const next = answers.shift();
    if (!next) throw new Error("no answer scripted");
    return next;
  };
  return { calls, fetchImpl };
};

const OPEN = { harness: "opencode", model: "m", role: "authoring", system: "s", prompt: "p", tools: [], timeoutMs: 60_000, maxOutputChars: 1000 };

describe("the agent bridge host seam (v2.6 plan 04 H, option 2)", () => {
  it("opens with the plugin header and CSRF, then long-polls past pending until a call arrives", async () => {
    const { calls, fetchImpl } = scripted([
      json(200, { ok: true, sessionId: "a".repeat(32) }),
      json(200, { kind: "pending" }),
      json(200, { kind: "call", callId: "c1", tool: "readStory", args: {} }),
      json(200, { answered: true }),
      json(200, { closed: true }),
    ]);
    const client = createHarnessBridgeClient(fetchImpl, () => ({ "X-CSRF-Token": "t" }));
    const opened = await client.open(OPEN);
    expect(opened).toEqual({ ok: true, sessionId: "a".repeat(32) });
    await expect(client.nextCall("a".repeat(32), Date.now() + 60_000)).resolves.toEqual({ kind: "call", callId: "c1", tool: "readStory", args: {} });
    await expect(client.answer("a".repeat(32), "c1", { ok: true, text: "x" })).resolves.toBe(true);
    await client.close("a".repeat(32));
    expect(calls.map((call) => call.url.split("/").slice(-2).join("/"))).toEqual(["agent/open", "agent/next", "agent/next", "agent/answer", "agent/close"]);
    expect(calls[0].headers).toMatchObject({ "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1", "X-CSRF-Token": "t" });
    expect(calls[3].body).toEqual({ sessionId: "a".repeat(32), callId: "c1", ok: true, text: "x" });
    expect(calls[1].body.waitMs).toBeLessThanOrEqual(20_000);
  });

  it("names refusals: a missing route, a refused user, a busy harness, the plugin's own verdict", async () => {
    for (const [answer, kind] of [[json(404, {}), "config"], [json(403, {}), "config"], [json(429, { ok: false, kind: "busy" }), "busy"], [json(200, { ok: false, kind: "auth", message: "log in" }), "auth"]] as const) {
      const { fetchImpl } = scripted([answer]);
      await expect(createHarnessBridgeClient(fetchImpl, () => ({})).open(OPEN)).resolves.toMatchObject({ ok: false, kind });
    }
  });

  it("a gone session, a failed poll and a spent deadline each end the session", async () => {
    const gone = scripted([json(404, {})]);
    await expect(createHarnessBridgeClient(gone.fetchImpl, () => ({})).nextCall("s", Date.now() + 1000)).resolves.toMatchObject({ kind: "ended", errorKind: "lapsed" });
    const broken = scripted([]);
    await expect(createHarnessBridgeClient(broken.fetchImpl, () => ({})).nextCall("s", Date.now() + 1000)).resolves.toMatchObject({ kind: "ended", errorKind: "transport" });
    const spent = scripted([]);
    await expect(createHarnessBridgeClient(spent.fetchImpl, () => ({}), () => 10).nextCall("s", 5)).resolves.toMatchObject({ kind: "ended", errorKind: "timeout" });
    expect(spent.calls).toHaveLength(0);
  });

  it("reads only the event shapes the plugin sends", () => {
    expect(readBridgeEvent({ kind: "pending" })).toBeNull();
    expect(readBridgeEvent({ kind: "done", text: "t" })).toEqual({ kind: "done", text: "t" });
    expect(readBridgeEvent({ kind: "ended", errorKind: "timeout", message: "m" })).toEqual({ kind: "ended", errorKind: "timeout", message: "m" });
    expect(readBridgeEvent({ kind: "call", callId: "c1" })).toMatchObject({ kind: "ended", errorKind: "malformed" });
    expect(readBridgeEvent("x")).toMatchObject({ kind: "ended", errorKind: "malformed" });
  });
});
