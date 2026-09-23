import type { JudgeRequest } from "@judge/index";
import { judgeTransport } from "./judge";

jest.mock("./context", () => ({
  getContext: () => ({ getRequestHeaders: () => ({}) }),
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
