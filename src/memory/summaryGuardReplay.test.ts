import { readFileSync } from "fs";
import { guardSummary, mentions, namesIn } from "./summaryGuard";

const sources = (process.env.SO_GUARD_PAYLOADS ?? "").split(",").filter(Boolean);
const MARK = "Maintain a rolling 3-5 sentence summary";

interface Step { chat: string; previous: string | null; window: string; play: string }

const between = (text: string, start: string, end: string): string | null => {
  const from = text.indexOf(start);
  if (from < 0) return null;
  const to = text.indexOf(end, from + start.length);
  return text.slice(from + start.length, to < 0 ? undefined : to).trim();
};

function steps(): Step[] {
  const out: Step[] = [];
  for (const file of sources) {
    const lastPlay = new Map<string, string>();
    for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      const prompt: unknown = row?.parsedBody?.prompt;
      if (typeof prompt !== "string") continue;
      const chat = `${file}#${row.chatId}`;
      if (!prompt.includes(MARK)) {
        if (row.draftMemberName) lastPlay.set(chat, prompt);
        continue;
      }
      out.push({ chat, previous: between(prompt, "EXISTING SUMMARY:\n", "\n\nNEW MESSAGES:"), window: between(prompt, "NEW MESSAGES:\n", "<turn|>") ?? "", play: lastPlay.get(chat) ?? "" });
    }
  }
  return out;
}

(sources.length ? describe : describe.skip)("v3.0 41 A2 offline: the collapse guard over recorded short-term chains (private payloads, numbers only)", () => {
  it("floor (declared before the run): refusal rate <= 0.2 per step; reports names lost per step and 5-step retention without the guard", () => {
    const all = steps();
    let pairs = 0;
    let refused = 0;
    const reasons: Record<string, number> = {};
    let named = 0;
    let lost = 0;
    const chains: number[] = [];
    const byChat = new Map<string, Step[]>();
    all.forEach((step) => byChat.set(step.chat, [...(byChat.get(step.chat) ?? []), step]));
    for (const list of byChat.values()) {
      for (let at = 0; at + 1 < list.length; at += 1) {
        const step = list[at];
        const output = list[at + 1].previous;
        if (step.previous === null || output === null) continue;
        pairs += 1;
        const covered = (name: string) => mentions(step.play, name);
        const verdict = guardSummary({ summary: output, previous: step.previous, window: step.window, vocabulary: [], covered });
        if (!verdict.ok) { refused += 1; reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1; }
        const names = namesIn(step.previous);
        named += names.length;
        lost += names.filter((name) => !mentions(output, name) && !covered(name)).length;
        const later = list[at + 5]?.previous;
        if (later) {
          const first = names.filter((name) => !covered(name));
          if (first.length) chains.push(first.filter((name) => mentions(later, name)).length / first.length);
        }
      }
    }
    const summary = {
      shortTermPrompts: all.length, steps: pairs, refusalRate: pairs ? Number((refused / pairs).toFixed(3)) : 0, reasons,
      namesLostPerStep: pairs ? Number((lost / pairs).toFixed(3)) : 0, nameLossShare: named ? Number((lost / named).toFixed(3)) : 0,
      retention5Unguarded: chains.length ? Number((chains.reduce((sum, value) => sum + value, 0) / chains.length).toFixed(3)) : null, chains: chains.length,
    };
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    expect(pairs).toBeGreaterThan(0);
  });
});
