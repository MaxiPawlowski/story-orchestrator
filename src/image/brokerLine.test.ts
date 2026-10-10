import { brokerLine } from "./brokerLine";

describe("GPU sharing status in plain words (v2.8 28)", () => {
  it("says nothing without the plugin and names the state with it", () => {
    expect(brokerLine(null)).toBeNull();
    expect(brokerLine({ adapter: "none", guarding: false })?.text).toMatch(/off/);
    expect(brokerLine({ adapter: "supervise", guarding: true, state: "idle" })?.text).toMatch(/^Idle/);
    expect(brokerLine({ adapter: "supervise", guarding: true, state: "image" })).toEqual({ tone: "busy", text: expect.stringMatching(/Rendering a picture/) });
    expect(brokerLine({ adapter: "supervise", guarding: true, state: "degraded" })?.tone).toBe("warn");
  });

  it("says why a picture waits", () => {
    expect(brokerLine({ adapter: "supervise", guarding: true, state: "waiting", lastError: "Image admission refused: Insufficient GPU headroom." })?.text)
      .toMatch(/Last refusal: Image admission refused/);
  });
});
