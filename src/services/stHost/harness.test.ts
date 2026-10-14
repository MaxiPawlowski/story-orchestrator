jest.mock("./context", () => ({ getContext: () => ({ getRequestHeaders: () => ({ "X-CSRF-Token": "t" }) }) }));

import { fetchHarnessStatus, HARNESS_SYSTEM, readHarnessAnswer, sendHarnessRequest, STALE_PAGE_REFUSAL } from "./harness";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const request = { harness: "claude" as const, model: "haiku", role: "read", prompt: "PROMPT", maxOutputChars: 600, timeoutMs: 20_000 };

afterEach(() => { delete (globalThis as { fetch?: unknown }).fetch; });

describe("H3: the host seam to the harness plugin", () => {
  it("reads an answer, its usage and whether the effort was applied", () => {
    expect(readHarnessAnswer({ ok: true, text: "PONG", finish: "stop", usage: { input: 402, output: 3 }, spawnMs: 7, effortApplied: true }, "high")).toMatchObject({
      ok: true, text: "PONG", finish: "stop", usage: { input: 402, output: 3, costUsd: null }, spawnMs: 7, meter: { effort: "high", applied: true, unsupported: null },
    });
    expect(readHarnessAnswer({ ok: true, text: "x", effortApplied: false }, "off")).toMatchObject({ finish: "unknown", meter: { applied: false, unsupported: expect.stringContaining("low, medium or high") } });
    expect(readHarnessAnswer({ ok: false, kind: "quota", message: "limit", retryAt: 5 }, "default")).toEqual({ ok: false, kind: "quota", message: "limit", retryAt: 5 });
    expect(readHarnessAnswer({ ok: false, kind: "explode", message: "?" }, "default")).toMatchObject({ kind: "transport" });
    expect(readHarnessAnswer("nope", "default")).toMatchObject({ ok: false, kind: "malformed" });
  });

  it("B5: the reply carries the model the plugin says answered, or null when it could not tell, never the one asked for", () => {
    expect(readHarnessAnswer({ ok: true, text: "x", model: "claude-sonnet-4-5", requested: "opus" }, "default")).toMatchObject({ model: "claude-sonnet-4-5" });
    expect(readHarnessAnswer({ ok: true, text: "x", model: null, requested: "gpt-6" }, "default")).toMatchObject({ model: null });
  });

  it("posts text/plain with the plugin header, the fixed system text and the prompt; retries a busy plugin", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const answers = [json(429, { ok: false, kind: "busy" }), json(200, { ok: true, text: "PONG", finish: "stop" })];
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return answers.shift(); }) as unknown as typeof fetch;
    jest.useFakeTimers();
    const pending = sendHarnessRequest(request);
    await jest.advanceTimersByTimeAsync(1500);
    jest.useRealTimers();
    await expect(pending).resolves.toMatchObject({ ok: true, text: "PONG" });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("/api/plugins/story-orchestrator-harness/complete");
    expect(calls[0].init.headers).toMatchObject({ "Content-Type": "text/plain;charset=UTF-8", "X-SO-Plugin": "1", "X-CSRF-Token": "t" });
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ harness: "claude", model: "haiku", role: "read", system: HARNESS_SYSTEM, prompt: "PROMPT", maxOutputChars: 600, timeoutMs: 20_000 });
    expect(body.effort).toBeUndefined();
  });

  it("names a missing plugin and a refused user as config, never as a model failure", async () => {
    globalThis.fetch = jest.fn(async () => json(404, {})) as unknown as typeof fetch;
    await expect(sendHarnessRequest(request)).resolves.toMatchObject({ ok: false, kind: "config", message: expect.stringContaining("not installed") });
    globalThis.fetch = jest.fn(async () => json(403, { error: "harness routes are admin-only on this install" })) as unknown as typeof fetch;
    await expect(sendHarnessRequest(request)).resolves.toMatchObject({ ok: false, kind: "config", message: expect.stringContaining("admin-only") });
    globalThis.fetch = jest.fn(async () => json(404, {})) as unknown as typeof fetch;
    await expect(fetchHarnessStatus()).resolves.toBeNull();
  });

  it("CR-J13: only the plugin's own JSON refusal is admin-only; SillyTavern's CSRF 403 is a stale page, named as such", async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => { throw new SyntaxError("Unexpected token F"); } })) as unknown as typeof fetch;
    const csrf = await sendHarnessRequest(request);
    expect(csrf).toMatchObject({ ok: false, kind: "transport", message: STALE_PAGE_REFUSAL });
    expect(csrf.ok === false && csrf.message).not.toContain("admin-only");
    globalThis.fetch = jest.fn(async () => json(403, {})) as unknown as typeof fetch;
    await expect(sendHarnessRequest(request)).resolves.toMatchObject({ kind: "transport", message: STALE_PAGE_REFUSAL });
  });

  it("CR-J8: a plugin that stays busy past the deadline answers busy, never transport", async () => {
    expect(readHarnessAnswer({ ok: false, kind: "busy", message: "queued" }, "default")).toEqual({ ok: false, kind: "busy", message: "queued" });
    globalThis.fetch = jest.fn(async () => json(429, { ok: false, kind: "busy", message: "claude has 8 calls queued; retry shortly" })) as unknown as typeof fetch;
    await expect(sendHarnessRequest({ ...request, timeoutMs: 500 })).resolves.toMatchObject({ ok: false, kind: "busy" });
  });

  it("CR-J6: the status row carries the plugin's hold", async () => {
    globalThis.fetch = jest.fn(async () => json(200, { pluginVersion: "1.1.0", harnesses: { opencode: { installed: true, offered: true, fresh: true, blocked: "opencode's real login file changed during a call", models: [] } } })) as unknown as typeof fetch;
    expect((await fetchHarnessStatus())?.harnesses.opencode?.blocked).toBe("opencode's real login file changed during a call");
  });

  it("reads the OpenCode login state, service and per-model image input, and drops what it does not know", async () => {
    globalThis.fetch = jest.fn(async () => json(200, { pluginVersion: "2.0.0", harnesses: { opencode: {
      installed: true, offered: true, fresh: false, loggedIn: false, loginState: "expired", loginAction: "sign-in-again", loginProblem: "run `opencode auth login`", service: "running", serviceVersion: "2.0.6", clientInstalled: true,
      models: [{ id: "openai/gpt-6.1-sol", context: 200000, image: true, available: true }, { id: "openai/gpt-6-luna", context: 128000, image: "yes" }],
    } } })) as unknown as typeof fetch;
    const row = (await fetchHarnessStatus(true))?.harnesses.opencode;
    expect(row).toMatchObject({ loginState: "expired", loginAction: "sign-in-again", service: "running", serviceVersion: "2.0.6", clientInstalled: true, loginProblem: "run `opencode auth login`" });
    expect(row?.models).toEqual([{ id: "openai/gpt-6.1-sol", context: 200000, image: true, available: true }, { id: "openai/gpt-6-luna", context: 128000 }]);
    globalThis.fetch = jest.fn(async () => json(200, { pluginVersion: "2.0.0", harnesses: { opencode: { installed: true, offered: true, fresh: true, loginState: "wrong", models: [] } } })) as unknown as typeof fetch;
    expect((await fetchHarnessStatus(true))?.harnesses.opencode?.loginState).toBeUndefined();
  });

  it("sends the images of a vision request and nothing when there are none", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = jest.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json(200, { ok: true, text: "seen", finish: "stop" }); }) as unknown as typeof fetch;
    await sendHarnessRequest({ ...request, harness: "opencode", model: "openai/gpt-6.1-sol", images: [{ data: "QUJD", mime: "image/png", description: "panel" }] });
    await sendHarnessRequest({ ...request, harness: "opencode", model: "openai/gpt-6.1-sol", images: [] });
    expect(bodies[0].images).toEqual([{ data: "QUJD", mime: "image/png", description: "panel" }]);
    expect("images" in bodies[1]).toBe(false);
  });

  it("reads the status rows it knows and drops the rest", async () => {
    globalThis.fetch = jest.fn(async () => json(200, { pluginVersion: "1.0.0", harnesses: { claude: { installed: true, offered: true, fresh: false, loginProblem: "run `claude` once", models: [{ id: "haiku", context: 200000 }, { bad: 1 }] }, gemini: {} } })) as unknown as typeof fetch;
    const status = await fetchHarnessStatus(true);
    expect(Object.keys(status?.harnesses ?? {})).toEqual(["claude"]);
    expect(status?.harnesses.claude).toMatchObject({ installed: true, offered: true, fresh: false, loginProblem: "run `claude` once", models: [{ id: "haiku", context: 200000 }] });
  });
});
