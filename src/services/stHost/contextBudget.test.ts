jest.mock("./context", () => ({ getContext: () => ({ mainApi: "textgenerationwebui" }) }));
jest.mock("./modules", () => ({ scriptModule: { getMaxContextTokens: () => 98304, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => 97704 } }));

import { promptBudgetFrom, readPromptBudget } from "./contextBudget";

describe("the main API's prompt budget (08-H3)", () => {
  it("reads context, reply and prompt from the script.js exports, with the API named", () => {
    expect(readPromptBudget()).toEqual({ ok: true, context: 98304, response: 600, prompt: 97704, api: "textgenerationwebui" });
  });

  it("says why when the build has no exports, never a guessed number", () => {
    expect(promptBudgetFrom({}, null)).toEqual({ ok: false, reason: expect.stringContaining("getMaxPromptTokens") });
    expect(promptBudgetFrom(null, null).ok).toBe(false);
  });

  it("refuses a non-numeric or non-positive prompt budget", () => {
    expect(promptBudgetFrom({ getMaxContextTokens: () => Number.NaN, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => 1 }, null).ok).toBe(false);
    expect(promptBudgetFrom({ getMaxContextTokens: () => 512, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => -88 }, null)).toEqual({ ok: false, reason: expect.stringContaining("leaves no room") });
  });

  it("answers a throwing export as a reason, not an exception", () => {
    expect(promptBudgetFrom({ getMaxContextTokens: () => { throw new Error("nai subscription lookup failed"); }, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => 1 }, null)).toEqual({ ok: false, reason: "nai subscription lookup failed" });
  });
});
