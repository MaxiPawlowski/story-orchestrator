jest.mock("./context", () => ({ getContext: () => ({ getRequestHeaders: () => ({ "X-CSRF-Token": "t" }) }) }));

import { fetchHarnessStatus, HARNESS_SYSTEM, readHarnessAnswer, sendHarnessRequest } from "./harness";

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
    globalThis.fetch = jest.fn(async () => json(403, {})) as unknown as typeof fetch;
    await expect(sendHarnessRequest(request)).resolves.toMatchObject({ ok: false, kind: "config", message: expect.stringContaining("admin-only") });
    globalThis.fetch = jest.fn(async () => json(404, {})) as unknown as typeof fetch;
    await expect(fetchHarnessStatus()).resolves.toBeNull();
  });

  it("reads the status rows it knows and drops the rest", async () => {
    globalThis.fetch = jest.fn(async () => json(200, { pluginVersion: "1.0.0", harnesses: { claude: { installed: true, offered: true, fresh: false, loginProblem: "run `claude` once", models: [{ id: "haiku", context: 200000 }, { bad: 1 }] }, gemini: {} } })) as unknown as typeof fetch;
    const status = await fetchHarnessStatus(true);
    expect(Object.keys(status?.harnesses ?? {})).toEqual(["claude"]);
    expect(status?.harnesses.claude).toMatchObject({ installed: true, offered: true, fresh: false, loginProblem: "run `claude` once", models: [{ id: "haiku", context: 200000 }] });
  });
});
