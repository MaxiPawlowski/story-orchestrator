import { sendConnectionProfileRequest } from "@services/STAPI";
import { testModel } from "../../test/support/modelCallHost";
import { callExtractionReply, probeModel, routedModel } from "./client";
import { isLapse, ModelCallError } from "./modelError";
import { askText, profileRoute, type ModelAsk } from "./modelRoute";
import { parseSharedReadResponse } from "./parse";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, sendConnectionProfileRequest: jest.fn() }));

const send = sendConnectionProfileRequest as jest.Mock;
const answer = (text: string, finish: "stop" | "length" | "unknown" = "stop") => send.mockResolvedValueOnce({ ok: true, text, finish });
const p1 = profileRoute("p1");
const READ: ModelAsk = { role: "read", pass: "read" };

const story = { qualityByKey: { door_open: { key: "door_open", type: "bool" as const, source: "extractor" as const } } } as unknown as Parameters<typeof parseSharedReadResponse>[1];

beforeEach(() => send.mockReset());

describe("askText over the client", () => {
  it("strips inline reasoning from a profile reply before any pass parses it", async () => {
    answer("<think>\nDELTA q=door_open value=false evidence=\"guess\"\n</think>\nDELTA q=door_open value=true evidence=\"the door swings open\"");
    const raw = await askText(routedModel(p1), "prompt", READ);
    expect(parseSharedReadResponse(raw, story).deltas.map((entry) => entry.delta.v)).toEqual([true]);
  });

  it("strips debug responses the same way", async () => {
    expect(await askText(routedModel(null), "prompt", { ...READ, debugResponse: "<think>draft</think>{\"ops\": []}" })).toBe("{\"ops\": []}");
  });

  it("a reply that only reasoned is reasoning-exhausted, not an empty answer (v2.6 plan 05 R2)", async () => {
    answer("<think>\nThe scene opens in the ruins and");
    await expect(askText(routedModel(p1), "prompt", READ)).rejects.toMatchObject({ kind: "reasoning-exhausted" });
  });
});

describe("callExtractionReply keeps call sites on Promise<string> and throws a typed failure", () => {
  it("hands back the finish reason with the text", async () => {
    answer("NO_DELTA", "length");
    expect(await callExtractionReply("prompt", p1)).toEqual({ text: "NO_DELTA", finish: "length" });
  });

  it("no profile is a config failure", async () => {
    await expect(callExtractionReply("prompt", null)).rejects.toMatchObject({ name: "ModelCallError", kind: "config" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["lapsed", "transport", "config"] as const)("a %s reply from the seam becomes a ModelCallError of that kind", async (kind) => {
    send.mockResolvedValueOnce({ ok: false, kind, message: `${kind} happened` });
    const error = await callExtractionReply("prompt", p1).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelCallError);
    expect(error).toMatchObject({ kind, message: `${kind} happened` });
    expect(isLapse(error)).toBe(kind === "lapsed");
  });

  it("a timeout names the budget it ran out of", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "timeout", message: "The operation was aborted due to timeout" });
    await expect(callExtractionReply("prompt", p1, { maxTokens: 96 })).rejects.toMatchObject({ kind: "timeout", message: "the memory model did not answer within 34804 ms" });
  });

  it("the caller's signal reaches the seam, joined with the call's own timeout", async () => {
    answer("NO_DELTA");
    const controller = new AbortController();
    await callExtractionReply("prompt", p1, { signal: controller.signal });
    const seen: AbortSignal = send.mock.calls[0][3].signal;
    expect(seen.aborted).toBe(false);
    controller.abort();
    expect(seen.aborted).toBe(true);
  });

  it("bounds every call by the callBudget timeout for the response it asked for", async () => {
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      answer("NO_DELTA");
      await callExtractionReply("prompt", p1, { maxTokens: 96 });
      expect(timeout).toHaveBeenCalledWith(34804);
    } finally {
      timeout.mockRestore();
    }
  });

  it("gives a large prompt time to be read before it can answer (live gate 3: an 88k-token memorize window timed out at 55.6 s)", async () => {
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      answer("NO_DELTA");
      await callExtractionReply("x".repeat(400000), p1, { maxTokens: 512 });
      expect(timeout).toHaveBeenCalledWith(30000 + 512 * 50 + 100000 * 2);
    } finally {
      timeout.mockRestore();
    }
  });

  it("sends the samplers for the seam to place, and the table's default response size", async () => {
    answer("NO_DELTA");
    await callExtractionReply("prompt", p1);
    expect(send.mock.calls[0][2]).toBe(512);
    expect(send.mock.calls[0][3].samplers).toEqual({ temperature: 0.1, top_p: 0.9 });
  });

  it("refuseIncomplete turns a truncated or looping summary into nothing to store", async () => {
    const ask: ModelAsk = { ...READ, refuseIncomplete: true };
    answer("The party crossed the river and", "length");
    expect(await askText(routedModel(p1), "prompt", ask)).toBe("");
    answer(Array.from({ length: 5 }, () => "The river is cold.").join("\n"));
    expect(await askText(routedModel(p1), "prompt", ask)).toBe("");
    answer("The party crossed the river.");
    expect(await askText(routedModel(p1), "prompt", ask)).toBe("The party crossed the river.");
  });

  it("control: without refuseIncomplete a truncated reply is returned as it came", async () => {
    answer("The party crossed the river and", "length");
    expect(await askText(routedModel(p1), "prompt", READ)).toBe("The party crossed the river and");
  });
});

describe("per-role routing in the one ModelCall", () => {
  afterEach(() => send.mockReset());

  it("an unrouted role goes to the memory profile", async () => {
    answer("NO_DELTA");
    await testModel("memory")("prompt", { role: "curator", pass: "curator" });
    expect(send.mock.calls[0][0]).toBe("memory");
  });

  it("a routed role goes to its own profile, and a failure names the profile it went to", async () => {
    const model = testModel("memory", { director: "fast" });
    send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed: down" });
    const failure = await model("prompt", { role: "director", pass: "director" }).catch((error: unknown) => error);
    expect(send.mock.calls[0][0]).toBe("fast");
    expect(failure).toMatchObject({ name: "ModelCallError", kind: "transport", profileId: "fast" });
    answer("NO_DELTA");
    await model("prompt", READ);
    expect(send.mock.calls[1][0]).toBe("memory");
  });

  it("a refused route is a config failure that sends nothing", async () => {
    const model = testModel("memory", { curator: "gone" }, (id) => id === "memory");
    await expect(model("prompt", { role: "curator", pass: "curator" })).rejects.toMatchObject({ kind: "config", profileId: "gone" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("probeModel (v2.6 plan 05 R2)", () => {
  it("a probe the model spent thinking still proves the backend answers, so the breaker can close", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "reasoning-exhausted", message: "spent" });
    expect(await probeModel("p1")).toEqual({ ok: true });
  });

  it("control: a transport failure is still a failed probe", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "down" });
    expect(await probeModel("p1")).toMatchObject({ ok: false, kind: "transport" });
  });
});
