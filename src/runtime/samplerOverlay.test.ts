import { SamplerOverlay, type SamplerRequest } from "./samplerOverlay";

const loud = (patch: Partial<SamplerRequest> = {}): SamplerRequest => ({ api: "textgen", chatId: "chat-a", type: null, dryRun: false, open: true, innermost: "normal", ...patch });

const armed = (api: "textgen" | "chat" = "textgen") => {
  const overlay = new SamplerOverlay();
  overlay.set({ chatId: "chat-a", checkpointId: "cp2", name: "Tense", api, values: { temperature: 0.4, top_p: 0.8, presence_penalty: 0.3 }, unknown: ["preset"] });
  return overlay;
};

describe("SamplerOverlay (v2.4 plan 06 seed A)", () => {
  it("overwrites present sampler keys on the loud generation of its own chat, and counts it", () => {
    const overlay = armed();
    const payload: Record<string, unknown> = { prompt: "p", temperature: 1, top_p: 1 };
    expect(overlay.apply(payload, loud())).toEqual({ first: true, applied: ["temperature", "top_p"], skipped: ["presence_penalty"] });
    expect(payload).toEqual({ prompt: "p", temperature: 0.4, top_p: 0.8 });
    expect(overlay.apply({ temperature: 1 }, loud())?.first).toBe(false);
    expect(overlay.view()).toMatchObject({ applied: 2, lastApplied: ["temperature"] });
  });

  it.each([
    ["a dry run", loud({ dryRun: true })],
    ["a nested quiet generation", loud({ innermost: "quiet" })],
    ["an impersonation", loud({ innermost: "impersonate" })],
    ["a chat-completion quiet request", loud({ type: "quiet" })],
    ["a request with no loud generation open", loud({ open: false })],
    ["another chat", loud({ chatId: "chat-b" })],
    ["the other backend's hook", loud({ api: "chat" })],
  ])("leaves %s untouched", (_label, request) => {
    const overlay = armed();
    const payload: Record<string, unknown> = { temperature: 1, top_p: 1 };
    expect(overlay.apply(payload, request)).toBeNull();
    expect(payload).toEqual({ temperature: 1, top_p: 1 });
    expect(overlay.view()?.applied).toBe(0);
  });

  it("applies to a chat-completion loud request by its own type", () => {
    const overlay = armed("chat");
    const payload: Record<string, unknown> = { type: "normal", temperature: 1 };
    expect(overlay.apply(payload, loud({ api: "chat", type: "normal" }))?.applied).toEqual(["temperature"]);
  });

  it("does nothing once cleared", () => {
    const overlay = armed();
    overlay.clear();
    expect(overlay.apply({ temperature: 1 }, loud())).toBeNull();
    expect(overlay.view()).toBeNull();
  });
});
