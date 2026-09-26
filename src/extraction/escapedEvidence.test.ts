import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceSources, type EvidenceMessage } from "./evidence";

interface EscapedCase {
  source: string;
  kind: "DELTA" | "FACT" | "MEMORY";
  evidence: string;
  quotes: number;
  window: Array<{ index: number; speaker: string; isUser: boolean; text: string }>;
}

const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/v25-05-escaped-evidence.json"), "utf-8")) as { cases: EscapedCase[] };
const messagesOf = (window: EscapedCase["window"]): EvidenceMessage[] => window.map((line) => ({ messageId: line.index, index: line.index, speaker: line.speaker, isUser: line.isUser, text: line.text }));

describe("v2.5 plan 05 F0: a quote that escapes its message's own quotes or newlines", () => {
  it("replays every escaped quote the v2.4 acceptance and post-freeze reads wrote", () => {
    expect(fixture.cases.map((entry) => entry.kind).sort()).toEqual([...Array(2).fill("DELTA"), "FACT", ...Array(16).fill("MEMORY")]);
    for (const entry of fixture.cases) expect(/\\["'n]/.test(entry.evidence)).toBe(true);
  });

  it.each(fixture.cases.map((entry) => [`${entry.kind} ${entry.evidence.slice(0, 70)}`, entry] as const))("finds %s in the message it copied", (_name, entry) => {
    expect(evidenceSources(entry.evidence, messagesOf(entry.window))).toEqual([entry.quotes]);
  });

  const scene: EvidenceMessage[] = [
    { messageId: 3, index: 3, speaker: "Tobias", isUser: false, text: "\"You'll find the posting details are thin.\" He shrugs.\nQuest: Wendhope\nReward: 300 gold" },
    { messageId: 4, index: 4, speaker: "Belle", isUser: false, text: "\"Then we go at dawn,\" Belle says." },
  ];

  it("reads \\\" as a quote and \\n as a line break, inside one message", () => {
    expect(evidenceSources("\\\"You'll find the posting details are thin.\\\" He shrugs.", scene)).toEqual([3]);
    expect(evidenceSources("Quest: Wendhope\\nReward: 300 gold", scene)).toEqual([3]);
    expect(evidenceSources("[4] Belle: \\\"Then we go at dawn,\\\" Belle says.", scene)).toEqual([4]);
  });

  it("control: an escape never joins two messages, and never makes a paraphrase a quote", () => {
    expect(evidenceSources("He shrugs.\\n\\\"Then we go at dawn,\\\"", scene)).toEqual([]);
    expect(evidenceSources("Reward: 300 gold\\nThen we go at dawn", scene)).toEqual([]);
    expect(evidenceSources("\\\"The posting says very little.\\\"", scene)).toEqual([]);
    expect(evidenceSources("\\n", scene)).toEqual([]);
    expect(evidenceSources("\\\"\\\"", scene)).toEqual([]);
  });

  it("control: an escaped label is still only the line's own label", () => {
    expect(evidenceSources("[3] Belle: \\\"Then we go at dawn,\\\"", scene)).toEqual([]);
    expect(evidenceSources("[4] Belle:", scene)).toEqual([]);
  });

  it("control: a backslash the message itself holds is still matched as written", () => {
    const path: EvidenceMessage[] = [{ messageId: 9, index: 9, speaker: "Scribe", isUser: false, text: "The map is filed under C:\\archive\\ruins today." }];
    expect(evidenceSources("filed under C:\\archive\\ruins today", path)).toEqual([9]);
    expect(evidenceSources("filed under C:\\\\archive\\\\ruins today", path)).toEqual([9]);
  });
});
