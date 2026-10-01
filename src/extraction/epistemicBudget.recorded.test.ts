import { buildEpistemicPassPrompt, EPISTEMIC_MAX_ENTRIES, EPISTEMIC_MAX_RETIRES } from "@memory/contract";
import { CHARS_PER_TOKEN_ESTIMATE, maxTokensFor } from "./callBudget";

const RECORDED_BUDGET = 768;

const RECORDED_OUTPUT_TOKENS = {
  epistemic: [
    466, 87, 87, 641, 322, 468, 768, 768, 530, 768, 235, 398, 599, 298, 175, 502, 517, 408, 229, 767, 768, 768,
    285, 768, 468,
    768, 768, 569, 387, 417,
  ],
  ledger: [
    230, 160, 152, 154, 150, 200, 190, 160, 151, 151, 187, 179, 212, 173, 90, 125, 129, 107, 117, 142, 199, 167,
    154, 325, 323,
    311, 177, 133, 252, 184,
  ],
};

const LONGEST_RECORDED_ENTRY_CHARS = 159;
const RETIRE_LINE_TOKENS = 6;

const truncated = (output: number): boolean => output >= RECORDED_BUDGET - 1;

const boundedReplyTokens = (prompt: string): number | null => {
  const entries = /at most (\d+) entries/i.exec(prompt);
  const retires = /at most (\d+) \[retire\] lines/i.exec(prompt);
  if (!entries) return null;
  const perEntry = Math.ceil(LONGEST_RECORDED_ENTRY_CHARS / CHARS_PER_TOKEN_ESTIMATE);
  return Number(entries[1]) * perEntry + (retires ? Number(retires[1]) * RETIRE_LINE_TOKENS : 0);
};

const fitShare = (outputs: number[], budget: number, bound: number | null): number => {
  const fits = outputs.filter((output) => (truncated(output) ? bound !== null && bound < budget : output < budget));
  return fits.length / outputs.length;
};

describe("T1 follow-up: the epistemic/ledger pass budgets hold the replies the T1 sessions recorded", () => {
  const prompt = buildEpistemicPassPrompt("Arin: hello", ["Arin", "Belle"], [{ tag: "knows", subject: "Arin", content: "x" }]);

  it("recorded 9 of 30 epistemic replies at the old 768 budget: their real length is unknown, so only the prompt's own bound can vouch for them", () => {
    expect(RECORDED_OUTPUT_TOKENS.epistemic.filter(truncated)).toHaveLength(9);
    expect(RECORDED_OUTPUT_TOKENS.ledger.filter(truncated)).toHaveLength(0);
    expect(Math.max(...RECORDED_OUTPUT_TOKENS.epistemic.filter((output) => !truncated(output)))).toBe(641);
  });

  it("asks for a bounded number of entries and retire lines", () => {
    expect(prompt).toContain(`at most ${EPISTEMIC_MAX_ENTRIES} entries`);
    expect(prompt).toContain(`at most ${EPISTEMIC_MAX_RETIRES} [retire] lines`);
  });

  it("fits at least 98 % of the recorded epistemic replies at the smallest budget the table can give", () => {
    expect(fitShare(RECORDED_OUTPUT_TOKENS.epistemic, maxTokensFor("epistemic", 0), boundedReplyTokens(prompt))).toBeGreaterThanOrEqual(0.98);
  });

  it("fits at least 98 % of the recorded ledger replies at the smallest budget the table can give", () => {
    expect(fitShare(RECORDED_OUTPUT_TOKENS.ledger, maxTokensFor("ledger", 0), null)).toBeGreaterThanOrEqual(0.98);
  });

  it("control: the old 768 floor with an unbounded prompt fits only 70 % of the epistemic replies", () => {
    expect(fitShare(RECORDED_OUTPUT_TOKENS.epistemic, RECORDED_BUDGET, null)).toBeCloseTo(21 / 30, 5);
  });
});
