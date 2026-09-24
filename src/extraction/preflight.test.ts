import { preflightMessage, preflightNeeded } from "./preflight";

const limit = { value: 8192, source: "preset" as const };

describe("v2.4 plan 03 D5: the preflight for a manual heavy pass", () => {
  it("asks when there are more than three requests", () => {
    expect(preflightNeeded({ requests: 4, tokens: 100 }, limit)).toBe(true);
    expect(preflightNeeded({ requests: 3, tokens: 100 }, limit)).toBe(false);
  });

  it("asks when the tokens exceed half the context limit", () => {
    expect(preflightNeeded({ requests: 1, tokens: 4097 }, limit)).toBe(true);
    expect(preflightNeeded({ requests: 1, tokens: 4096 }, limit)).toBe(false);
  });

  it("names the requests, the tokens and the profile", () => {
    expect(preflightMessage({ requests: 12, tokens: 48213.4 }, "Artemis Extraction")).toBe("12 requests, about 48,213 tokens to Artemis Extraction. Send them?");
    expect(preflightMessage({ requests: 1, tokens: 900 }, "p")).toBe("1 request, about 900 tokens to p. Send them?");
  });
});
