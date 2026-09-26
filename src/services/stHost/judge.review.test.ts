import type { JudgeRequest } from "@judge/index";
import { judgeTransport } from "./judge";

jest.mock("./context", () => ({
  getContext: () => ({ getRequestHeaders: () => ({ "Content-Type": "application/json", "X-CSRF-Token": "t" }) }),
}));

jest.mock("./modules", () => ({ importSTModule: jest.fn() }));

const request: JudgeRequest = {
  state: { scene: "the hall" },
  questions: {
    location: {
      type: "choice",
      instructions: "Where?",
      criteria: { hall: "in the hall", road: "on the road" },
    },
  },
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("an already-aborted epoch signal reaches fetch already aborted", async () => {
  let started = 0;
  const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.signal?.aborted) started += 1;
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
  globalThis.fetch = fetchMock as typeof fetch;
  const controller = new AbortController();
  controller.abort();

  await expect(judgeTransport(request, { timeoutMs: 5000, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(started).toBe(0);
});

test("v2.5 plan 12 PS-J 2/6: the transport posts text/plain with the plugin header and keeps ST's CSRF token", async () => {
  const seen: RequestInit[] = [];
  globalThis.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(init ?? {});
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: {} }), { status: 200 });
  }) as typeof fetch;
  await judgeTransport(request, { timeoutMs: 5000 });
  const headers = seen[0].headers as Record<string, string>;
  expect(headers["Content-Type"]).toBe("text/plain;charset=UTF-8");
  expect(headers["X-SO-Plugin"]).toBe("1");
  expect(headers["X-CSRF-Token"]).toBe("t");
  expect(JSON.parse(String(seen[0].body))).toEqual(request);
});
