import { verifyCanonText } from "./canonVerification";
import type { JudgeRuntime } from "./judge";

const sources = { storyTitle: "The Crossing", cast: ["Guide"], checkpoint: null, arcSummaries: ["They crossed safely."], facts: [] };
const text = "WHAT HAS HAPPENED:\nThey crossed safely. They found a treasure.\nCURRENT STATE:\nThey are resting.";
const judge = (active: boolean, answers: unknown) => ({ active: () => active, ask: jest.fn(async () => ({ answers })) }) as unknown as JudgeRuntime;

test("canon drops only answered unsupported sentences, preserving headings and unanswered sentences", async () => {
  const h = judge(true, { "sentence:0": { type: "noul", noul: 0.95 }, "sentence:1": { type: "noul", noul: 0.01 } });
  const result = await verifyCanonText(h, text, sources);
  expect(result).toContain("They crossed safely.");
  expect(result).not.toContain("treasure");
  expect(result).toContain("CURRENT STATE:");
  expect(result).toContain("They are resting.");
  expect(h.ask).toHaveBeenCalledWith("canonVerify", expect.anything(), { timeoutMs: 3000 });
});

test("canon switch off sends nothing; unavailable judge preserves synthesis", async () => {
  const off = judge(false, {});
  expect(await verifyCanonText(off, text, sources)).toBe(text);
  expect(off.ask).not.toHaveBeenCalled();
  expect(await verifyCanonText(judge(true, null), text, sources)).toBe(text);
});
