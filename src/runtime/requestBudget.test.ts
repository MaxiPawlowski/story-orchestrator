const popup = { answer: true, asked: [] as string[] };
const tokenizer = { calls: 0 };

jest.mock("@services/STAPI", () => ({
  readProfileContextLimit: (profileId: string | null) => (profileId ? { value: 16384, source: "preset" } : { value: 8192, source: "default", reason: "no memory model profile is selected" }),
  listConnectionProfiles: () => [{ id: "p1", name: "Artemis Extraction" }],
  showConfirmPopup: async (text: string) => { popup.asked.push(text); return popup.answer; },
  countTokens: async (text: string) => { tokenizer.calls += 1; return text.length; },
}));
jest.mock("./settingsStore", () => ({ getGlobalSettings: () => ({ extraction: { profileId: "p1" } }) }));

import { confirmPreflight, requestBudget } from "./requestBudget";

beforeEach(() => { popup.answer = true; popup.asked = []; tokenizer.calls = 0; });

describe("v2.4 plan 03 D5 host wiring", () => {
  it("a budget reads the profile's limit and counts with the host tokenizer", async () => {
    const budget = requestBudget("p1");
    expect(budget.contextLimit).toEqual({ value: 16384, source: "preset" });
    await budget.meter.prime(["abcdef"]);
    expect(tokenizer.calls).toBe(1);
    expect(budget.meter.count("abcdef")).toBe(6);
  });

  it("a small manual pass is not interrupted", async () => {
    expect(await confirmPreflight({ requests: 2, tokens: 8000 })).toBe(true);
    expect(popup.asked).toEqual([]);
  });

  it("a large one names the requests, the tokens and the profile, and a cancel is a no", async () => {
    popup.answer = false;
    expect(await confirmPreflight({ requests: 9, tokens: 30000 })).toBe(false);
    expect(popup.asked).toEqual(["9 requests, about 30,000 tokens to Artemis Extraction. Send them?"]);
  });

  it("half the preset's limit is the token threshold", async () => {
    expect(await confirmPreflight({ requests: 1, tokens: 8193 })).toBe(true);
    expect(popup.asked).toHaveLength(1);
  });
});
