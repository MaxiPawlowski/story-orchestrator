import { sendConnectionProfileRequest } from "@services/STAPI";
import { callExtractionModel, callExtractionReply, isLapse, ModelCallError, setProfileRouter } from "./client";
import { parseSharedReadResponse } from "./parse";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, sendConnectionProfileRequest: jest.fn() }));

const send = sendConnectionProfileRequest as jest.Mock;
const answer = (text: string, finish: "stop" | "length" | "unknown" = "stop") => send.mockResolvedValueOnce({ ok: true, text, finish });

const story = { qualityByKey: { door_open: { key: "door_open", type: "bool" as const, source: "extractor" as const } } } as unknown as Parameters<typeof parseSharedReadResponse>[1];

beforeEach(() => send.mockReset());

describe("callExtractionModel", () => {
  it("strips inline reasoning from a profile reply before any pass parses it", async () => {
    answer("<think>\nDELTA q=door_open value=false evidence=\"guess\"\n</think>\nDELTA q=door_open value=true evidence=\"the door swings open\"");
    const raw = await callExtractionModel("prompt", { profileId: "p1" });
    expect(parseSharedReadResponse(raw, story).deltas.map((entry) => entry.delta.v)).toEqual([true]);
  });

  it("strips debug responses the same way", async () => {
    expect(await callExtractionModel("prompt", { profileId: null, debugResponse: "<think>draft</think>{\"ops\": []}" })).toBe("{\"ops\": []}");
  });

  it("returns an empty reply when the model only reasoned", async () => {
    answer("<think>\nThe scene opens in the ruins and");
    expect(await callExtractionModel("prompt", { profileId: "p1" })).toBe("");
  });
});

describe("callExtractionReply keeps call sites on Promise<string> and throws a typed failure (v2.4 plan 03 D1)", () => {
  it("hands back the finish reason with the text", async () => {
    answer("NO_DELTA", "length");
    expect(await callExtractionReply("prompt", { profileId: "p1" })).toEqual({ text: "NO_DELTA", finish: "length" });
  });

  it("no profile is a config failure", async () => {
    await expect(callExtractionReply("prompt", { profileId: null })).rejects.toMatchObject({ name: "ModelCallError", kind: "config" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["lapsed", "transport", "config"] as const)("a %s reply from the seam becomes a ModelCallError of that kind", async (kind) => {
    send.mockResolvedValueOnce({ ok: false, kind, message: `${kind} happened` });
    const error = await callExtractionReply("prompt", { profileId: "p1" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelCallError);
    expect(error).toMatchObject({ kind, message: `${kind} happened` });
    expect(isLapse(error)).toBe(kind === "lapsed");
  });

  it("a timeout names the budget it ran out of", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "timeout", message: "The operation was aborted due to timeout" });
    await expect(callExtractionReply("prompt", { profileId: "p1", maxTokens: 96 })).rejects.toMatchObject({ kind: "timeout", message: "the memory model did not answer within 34804 ms" });
  });

  it("the caller's signal reaches the seam, joined with the call's own timeout", async () => {
    answer("NO_DELTA");
    const controller = new AbortController();
    await callExtractionReply("prompt", { profileId: "p1", signal: controller.signal });
    const seen: AbortSignal = send.mock.calls[0][3].signal;
    expect(seen.aborted).toBe(false);
    controller.abort();
    expect(seen.aborted).toBe(true);
  });

  it("bounds every call by the callBudget timeout for the response it asked for", async () => {
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      answer("NO_DELTA");
      await callExtractionReply("prompt", { profileId: "p1", maxTokens: 96 });
      expect(timeout).toHaveBeenCalledWith(34804);
    } finally {
      timeout.mockRestore();
    }
  });

  it("gives a large prompt time to be read before it can answer (live gate 3: an 88k-token memorize window timed out at 55.6 s)", async () => {
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      answer("NO_DELTA");
      await callExtractionReply("x".repeat(400000), { profileId: "p1", maxTokens: 512 });
      expect(timeout).toHaveBeenCalledWith(30000 + 512 * 50 + 100000 * 2);
    } finally {
      timeout.mockRestore();
    }
  });

  it("sends the samplers for the seam to place, and the table's default response size", async () => {
    answer("NO_DELTA");
    await callExtractionReply("prompt", { profileId: "p1" });
    expect(send.mock.calls[0][2]).toBe(512);
    expect(send.mock.calls[0][3].samplers).toEqual({ temperature: 0.1, top_p: 0.9 });
  });

  it("refuseIncomplete turns a truncated or looping summary into nothing to store", async () => {
    answer("The party crossed the river and", "length");
    expect(await callExtractionModel("prompt", { profileId: "p1", refuseIncomplete: true })).toBe("");
    answer(Array.from({ length: 5 }, () => "The river is cold.").join("\n"));
    expect(await callExtractionModel("prompt", { profileId: "p1", refuseIncomplete: true })).toBe("");
    answer("The party crossed the river.");
    expect(await callExtractionModel("prompt", { profileId: "p1", refuseIncomplete: true })).toBe("The party crossed the river.");
  });

  it("control: without refuseIncomplete a truncated reply is returned as it came", async () => {
    answer("The party crossed the river and", "length");
    expect(await callExtractionModel("prompt", { profileId: "p1" })).toBe("The party crossed the river and");
  });
});

describe("per-role routing at the client (v2.4 plan 08 T18)", () => {
  afterEach(() => send.mockReset());

  it("without a router every call keeps its own profile: today's behaviour", async () => {
    answer("NO_DELTA");
    await callExtractionReply("prompt", { profileId: "memory", role: "curator" });
    expect(send.mock.calls[0][0]).toBe("memory");
  });

  it("a routed role goes to its own profile, and a failure names the profile it went to", async () => {
    const release = setProfileRouter((role, fallback) => ({ ok: true, profileId: role === "director" ? "fast" : fallback }));
    try {
      send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed: down" });
      const failure = await callExtractionReply("prompt", { profileId: "memory", role: "director" }).catch((error: unknown) => error);
      expect(send.mock.calls[0][0]).toBe("fast");
      expect(failure).toMatchObject({ name: "ModelCallError", kind: "transport", profileId: "fast" });
      answer("NO_DELTA");
      await callExtractionReply("prompt", { profileId: "memory", role: "read" });
      expect(send.mock.calls[1][0]).toBe("memory");
    } finally {
      release();
    }
  });

  it("a refused route is a config failure that sends nothing", async () => {
    const release = setProfileRouter(() => ({ ok: false, profileId: "gone", reason: "The profile chosen for World Info curator no longer exists (ID: gone)" }));
    try {
      await expect(callExtractionReply("prompt", { profileId: "memory", role: "curator" })).rejects.toMatchObject({ kind: "config", profileId: "gone" });
      expect(send).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});
