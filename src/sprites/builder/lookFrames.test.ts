import { completeLookFrames } from "./lookFrames";

describe("changed-look animation", () => {
  it("yields to text between each missing frame and returns that look's complete pair", async () => {
    const calls: string[] = [];
    const frames = await completeLookFrames({ guard: () => undefined, cached: async () => null,
      wait: async () => { calls.push("text"); }, render: async (kind) => { calls.push(kind); return `/new/${kind}.png`; } });
    expect(calls).toEqual(["text", "blink", "text", "talk"]);
    expect(frames).toEqual({ blink: "/new/blink.png", talk: "/new/talk.png" });
  });

  it("does not render or lease for a verified cached pair", async () => {
    const render = jest.fn(), wait = jest.fn();
    expect(await completeLookFrames({ guard: () => undefined, cached: async (kind) => `/cached/${kind}.png`, render, wait }))
      .toEqual({ blink: "/cached/blink.png", talk: "/cached/talk.png" });
    expect(render).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("refuses a frame that answered after a chat switch and starts no following frame", async () => {
    let owns = true;
    const render = jest.fn(async () => { owns = false; return "/departed.png"; });
    await expect(completeLookFrames({ guard: () => { if (!owns) throw new Error("stale"); }, cached: async () => null,
      wait: async () => undefined, render })).rejects.toThrow("stale");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("rechecks ownership after the text-priority wait, before any GPU frame", async () => {
    let owns = true;
    const render = jest.fn();
    await expect(completeLookFrames({ guard: () => { if (!owns) throw new Error("stale"); }, cached: async () => null,
      wait: async () => { owns = false; }, render })).rejects.toThrow("stale");
    expect(render).not.toHaveBeenCalled();
  });
});
