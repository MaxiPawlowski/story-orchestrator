import { maxTokensCap } from "@extraction/callBudget";
import type { ExtractionReply, ModelAsk, ModelCall } from "@extraction/modelRoute";
import { CanonSynthesis } from "./canonSynthesis";
import { testOwnership } from "../../test/findings/testOwnership";

const CANON = "WHAT HAS HAPPENED:\nThe Grey Pennants held the wall at Wendhope.\nCURRENT STATE:\nThe fog withdrew.\nESTABLISHED FACTS:\nMax leads.";

function harness(replies: Array<ExtractionReply["finish"]>) {
  const asks: ModelAsk[] = [];
  const notes: Array<{ summary: string; note: string }> = [];
  let memory = {
    entries: [],
    arcs: [{ id: "arc-0", text: "the wall", status: "resolved" as const, summary: "They held the south wall until dawn." }],
    canon: { text: "WHAT HAS HAPPENED:\nThe party formed at the guild hall.", inputHash: "old", updatedAt: "2026-10-01T14:14:51.969Z", stale: false, sources: [] } as { text: string; updatedAt: string } | null,
  };
  const model: ModelCall = async (_prompt, ask) => {
    asks.push(ask);
    const finish = replies[asks.length - 1] ?? "stop";
    return { text: finish === "length" ? CANON.slice(0, 40) : CANON, finish };
  };
  const synthesis = new CanonSynthesis({
    getStory: () => ({ title: "Adolion", checkpointById: { cp: { id: "cp", name: "At the Walls", objective: "" } } }) as never,
    getState: () => ({ activeCheckpointId: "cp", boundary: 50, lastMessageId: 77 }) as never,
    memory: () => memory as never,
    patch: (next) => { memory = { ...memory, ...(next as object) }; },
    record: () => {},
    save: async () => {},
    model: () => model,
    ownership: () => testOwnership(),
    enabled: () => true,
    firedTransitions: () => [],
    facts: () => [],
    restingEntries: (entries) => entries,
    restingLines: (text) => text,
    journal: (summary, note) => { notes.push({ summary, note }); },
  });
  return { synthesis, asks, notes, canon: () => memory.canon?.text ?? null };
}

describe("T1-1: a canon reply cut at its output limit is asked again, not dropped for good", () => {
  it("a cut reply is asked again at the canon cap and the complete answer replaces the old canon", async () => {
    const run = harness(["length", "stop"]);
    expect(await run.synthesis.regenerateCanon(true)).toBe(true);
    expect(run.asks).toHaveLength(2);
    expect(run.asks[1].maxTokens).toBe(maxTokensCap("canon"));
    expect(run.asks[1].maxTokens).toBeGreaterThan(run.asks[0].maxTokens ?? 0);
    expect(run.canon()).toBe(CANON);
    expect(run.notes).toEqual([]);
  });

  it("cut twice: the old canon stays, nothing truncated is stored, and the author's journal says why", async () => {
    const run = harness(["length", "length"]);
    expect(await run.synthesis.regenerateCanon(true)).toBe(false);
    expect(run.asks).toHaveLength(2);
    expect(run.canon()).toBe("WHAT HAS HAPPENED:\nThe party formed at the guild hall.");
    expect(run.notes).toHaveLength(1);
    expect(run.notes[0].summary).toBe("canon not refreshed");
    expect(run.notes[0].note).toContain(`cut at ${maxTokensCap("canon")} tokens`);
    expect(run.notes[0].note).toContain("2026-10-01T14:14:51.969Z");
  });

  it("control: a complete first reply is asked once and journals nothing", async () => {
    const run = harness(["stop"]);
    expect(await run.synthesis.regenerateCanon(true)).toBe(true);
    expect(run.asks).toHaveLength(1);
    expect(run.notes).toEqual([]);
  });
});
