import { parsePromptBuckets } from "./promptBucketsParse";

const manager = (counts: Record<string, unknown>, tokenUsage: unknown = 0) => ({ tokenHandler: { getCounts: () => counts }, tokenUsage });

describe("v2.5 plan 07 A4: reading ST's Chat Completion prompt buckets", () => {
  it("reads each identifier's count and ST's own total on Chat Completion", () => {
    expect(parsePromptBuckets("openai", manager({ main: 120, chatHistory: 900, worldInfoBefore: 40 }, 1060))).toEqual({ ok: true, counts: { main: 120, chatHistory: 900, worldInfoBefore: 40 }, total: 1060 });
  });

  it("drops a count that is not a finite number instead of guessing it", () => {
    expect(parsePromptBuckets("openai", manager({ main: 10, broken: Number.NaN, text: "12" }, 10))).toMatchObject({ ok: true, counts: { main: 10 } });
  });

  it("refuses on Text Completion: ST keeps no buckets there", () => {
    const result = parsePromptBuckets("textgenerationwebui", manager({ main: 1 }, 1));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain("Chat Completion");
    expect(result.ok ? null : result.notChatCompletion).toBe(true);
    expect(parsePromptBuckets("openai", null)).not.toHaveProperty("notChatCompletion");
  });

  it("refuses when the prompt manager is not there or has no token handler, rather than reading a shape it does not know", () => {
    expect(parsePromptBuckets("openai", null).ok).toBe(false);
    expect(parsePromptBuckets("openai", { tokenHandler: null, tokenUsage: 0 }).ok).toBe(false);
    expect(parsePromptBuckets("openai", { tokenHandler: { getCounts: () => ({ main: 1 }) }, tokenUsage: "x" }).ok).toBe(false);
  });

  it("a handler that throws reads as unavailable", () => {
    expect(parsePromptBuckets("openai", { tokenHandler: { getCounts: () => { throw new Error("boom"); } }, tokenUsage: 0 }).ok).toBe(false);
  });
});
