import { buildCanonSummaryPrompt, CANON_WORD_LIMIT } from "@memory/canon";
import { maxTokensCap, maxTokensFor, type ResponseBudget } from "./callBudget";

const OLD_TABLE: ResponseBudget = { ratio: 0.25, floor: 768, cap: 1536 };

const RECORDED_CANON_OUTPUT_TOKENS = {
  oldBudget: {
    "T0-3-1": [401, 468, 345],
    "T0-1-1": [690, 730, 768],
    "T0-2-2": [768, 768, 768, 768, 768],
    "T1-1-1": [574, 768, 768, 635, 768, 768, 768, 768, 768, 799, 854, 861, 932, 989, 1046],
    "T1-3-1": [768, 760, 768],
    "T1-2-1": [768, 768],
    "T2-4-1": [1041],
  },
  currentBudget: {
    "T1-4-1": [520, 475, 545, 583, 600],
    "T1-6-1": [617, 638, 746, 656, 565],
    "T1-5-1": [470, 507, 518, 506, 617, 631, 718],
    "T1-7-1": [617, 596, 607, 541, 311],
    "T2-2-1": [529, 544],
    "T2-1-2": [569, 555, 639, 758, 635, 692, 592, 645, 685, 494, 583, 556, 646, 608, 532, 633, 776, 624],
    "T2-4-1": [576, 760],
  },
};

const MAX_TOKENS_PER_WORD = 2;

const oldOutputs = Object.values(RECORDED_CANON_OUTPUT_TOKENS.oldBudget).flat();
const currentOutputs = Object.values(RECORDED_CANON_OUTPUT_TOKENS.currentBudget).flat();
const cutAtOldBudget = (output: number): boolean => output >= OLD_TABLE.floor;
const cut = oldOutputs.filter(cutAtOldBudget);
const completed = [...oldOutputs.filter((output) => !cutAtOldBudget(output)), ...currentOutputs];

const boundTokens = (prompt: string): number | null => {
  const words = /at most (\d+) words/i.exec(prompt);
  return words ? Number(words[1]) * MAX_TOKENS_PER_WORD : null;
};

const fitShare = (budget: number, bound: number | null): number => {
  const all = [...oldOutputs, ...currentOutputs];
  const fits = all.filter((output) => (oldOutputs.includes(output) && cutAtOldBudget(output) ? bound !== null && bound < budget : output < budget));
  return fits.length / all.length;
};

describe("T1-1/T2-4: the canon budget holds the replies T0-T2 recorded (journal.jsonl model-call rows, pass canon)", () => {
  const prompt = buildCanonSummaryPrompt("Adolion", ["The party formed."], ["Max leads the Grey Pennants."], { id: "cp", name: "The Guild Hall", objective: "" });

  it("recorded 76 canon replies, 24 of them at the old budget's output limit (768, or the ratio cap above it): their real length is unknown", () => {
    expect(oldOutputs.length + currentOutputs.length).toBe(76);
    expect(cut).toHaveLength(24);
    expect(Math.max(...completed)).toBe(776);
    expect(Math.max(...currentOutputs)).toBeLessThan(maxTokensFor("canon", 0) / 1.5);
  });

  it("at least 98% fit the first ask: every completed reply with a third to spare, and every cut one under the prompt's own word bound", () => {
    expect(boundTokens(prompt)).toBe(CANON_WORD_LIMIT * MAX_TOKENS_PER_WORD);
    expect(fitShare(maxTokensFor("canon", 0), boundTokens(prompt))).toBeGreaterThanOrEqual(0.98);
  });

  it("the re-ask after a cut reply has room for twice the longest reply ever cut", () => {
    expect(maxTokensCap("canon")).toBeGreaterThanOrEqual(2 * Math.max(...cut));
  });

  it("control: the old table without a word bound fit under 98% (T1-1's story so far froze at the guild hall)", () => {
    expect(fitShare(OLD_TABLE.floor, null)).toBeLessThan(0.98);
    expect(cut.length / oldOutputs.length).toBeGreaterThan(0.6);
  });
});
