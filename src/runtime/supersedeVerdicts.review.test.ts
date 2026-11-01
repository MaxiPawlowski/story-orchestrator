import { provenance } from "@memory/provenance";
import { reverseMemoryState } from "@memory/reverse";
import { buildVerdictPrompt, planVerdicts, VERDICT_BATCH } from "@memory/supersedeVerdicts";
import type { DerivedRecord } from "@memory/derived";
import type { MemoryEntry } from "@memory/types";
import { createMemory } from "./extras";
import { applyReadyVerdicts, askVerdicts, queueVerdictPairs, verdictWork } from "./supersedeVerdicts";
import type { ChapterHost } from "./chapterPort";
import type { MemoryRuntimeState } from "./types";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const row = (id: string, text: string, messageId: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: text,
  createdAt: messageId, messageId, recallCount: 0, provenance: provenance({ source: "extractor", messageId, boundary: messageId, pass: "shared-read" }), ...extra,
});

const PAIRS = [
  { existingId: "old-post", candidateId: "new-post" },
  { existingId: "old-dog", candidateId: "new-cat" },
  { existingId: "old-lock", candidateId: "new-lock" },
];

function harness(answer = "SUPERSEDE 1\nINDEPENDENT 2", settings: Record<string, unknown> = {}) {
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token: RunToken) => tokenMatches(context, token) };
  const base = createMemory();
  let memory: MemoryRuntimeState = {
    ...base, settings: { ...base.settings, ...settings },
    entries: [
      row("old-post", "Tobin guards the east gate.", 2, { contradicted: true }), row("new-post", "Tobin now guards the harbour.", 8),
      row("old-dog", "Mira has a dog.", 3, { contradicted: true }), row("new-cat", "Mira has a cat.", 9),
      row("old-lock", "Esk is the archivist.", 4, { locked: true }), row("new-lock", "Esk is the new toll keeper.", 10),
    ],
  };
  const journal = jest.fn();
  const prompts: string[] = [];
  let state = { boundary: 6, lastMessageId: 11 };
  const host = {
    memory: () => memory,
    patch: (next: Partial<MemoryRuntimeState>) => { memory = { ...memory, ...next }; },
    record: (input: Omit<DerivedRecord, "id" | "boundary" | "messageId">) => { memory = { ...memory, derived: [...memory.derived, { ...input, id: `d${memory.derived.length}`, boundary: state.boundary, messageId: state.lastMessageId }] }; },
    save: async () => {},
    coordinator: { updateInjection: jest.fn() },
    deps: {
      ownership, journal, getState: () => state,
      model: async (prompt: string) => { prompts.push(prompt); return { text: answer, finish: "stop" }; },
    },
  } as unknown as ChapterHost;
  return {
    host, journal, prompts, context, memory: () => memory, setState: (next: typeof state) => { state = next; },
  };
}

describe("v3.0 41 A3: idle-time supersession verdicts (memory.supersedeVerdicts)", () => {
  it("asks once for the open pairs (a locked side is left to the conflict queue), and applies only at the next boundary", async () => {
    const run = harness();
    expect(queueVerdictPairs(run.host, PAIRS)).toBe(3);
    expect(await askVerdicts(run.host, () => false)).toBe(2);
    expect(run.prompts).toHaveLength(1);
    expect(run.prompts[0]).toContain("1. OLDER: Tobin guards the east gate.");
    expect(run.prompts[0]).not.toContain("archivist");
    expect(run.memory().entries.find((entry) => entry.id === "old-post")?.supersededBy).toBeUndefined();
    expect(verdictWork(run.host)).toEqual({ askable: false, ready: true });
    expect(applyReadyVerdicts(run.host)).toEqual({ superseded: 1, cleared: 1 });
    const byId = new Map(run.memory().entries.map((entry) => [entry.id, entry]));
    expect(byId.get("old-post")).toMatchObject({ supersededBy: "new-post", supersededAt: { messageId: 11, boundary: 6 } });
    expect(byId.get("old-dog")?.contradicted).toBe(false);
    expect(byId.get("old-lock")?.supersededBy).toBeUndefined();
    expect(run.memory().derived).toEqual([expect.objectContaining({ kind: "dedup", inputs: ["new-post", "old-post"], removed: [] })]);
    expect(run.journal).toHaveBeenCalledWith("supersession-verdicts", "1 older memory retired, 1 kept as separate");
  });

  it("is a derived artifact: a rollback past the newer row drops the record and puts the older row back in play (rollback ≡ replay)", async () => {
    const run = harness();
    queueVerdictPairs(run.host, PAIRS);
    await askVerdicts(run.host, () => false);
    const before = run.memory();
    applyReadyVerdicts(run.host);
    const reversed = { ...run.memory(), ...reverseMemoryState(run.memory(), 8, 5) };
    const old = reversed.entries.find((entry) => entry.id === "old-post");
    expect(old?.supersededBy).toBeUndefined();
    expect(reversed.entries.some((entry) => entry.id === "new-post")).toBe(false);
    expect(reversed.derived.some((record) => record.kind === "dedup")).toBe(false);
    const replay = { ...before, ...reverseMemoryState(before, 8, 5) };
    expect(reversed.entries.find((entry) => entry.id === "old-post")).toEqual(replay.entries.find((entry) => entry.id === "old-post"));
  });

  it("never asks while a reply is being written, and keeps the pairs for the next idle moment", async () => {
    const run = harness();
    queueVerdictPairs(run.host, PAIRS);
    expect(await askVerdicts(run.host, () => true)).toBe(0);
    expect(run.prompts).toHaveLength(0);
    expect(verdictWork(run.host)).toEqual({ askable: true, ready: false });
  });

  it("a verdict from a chat that is gone (or a rolled-back window) is discarded at apply", async () => {
    const run = harness();
    queueVerdictPairs(run.host, PAIRS);
    await askVerdicts(run.host, () => false);
    run.context.chatId = "chat-b";
    expect(applyReadyVerdicts(run.host)).toBeNull();
    expect(run.memory().entries.find((entry) => entry.id === "old-post")?.supersededBy).toBeUndefined();
  });

  it("switch off: nothing is queued or asked", async () => {
    const run = harness(undefined, { supersedeVerdicts: false });
    expect(queueVerdictPairs(run.host, PAIRS)).toBe(0);
    expect(await askVerdicts(run.host, () => false)).toBe(0);
    expect(run.prompts).toHaveLength(0);
  });

  it("planted verdict fixture: unanswered or malformed lines decide nothing, and a batch holds at most eight pairs", () => {
    const pairs = Array.from({ length: 10 }, (_, index) => ({ existingId: `o${index}`, candidateId: `n${index}` }));
    expect(planVerdicts("SUPERSEDE 1\nmaybe 2\nINDEPENDENT 3\nSUPERSEDE 99", pairs.slice(0, 3))).toEqual({ supersede: [pairs[0]], independent: [pairs[2]] });
    expect(VERDICT_BATCH).toBe(8);
    const entries = pairs.flatMap((pair, index) => [row(pair.existingId, `old ${index}`, index), row(pair.candidateId, `new ${index}`, index + 20)]);
    expect(buildVerdictPrompt(entries, pairs.slice(0, 2)).split("\n").filter((line) => /^\d+\. OLDER/.test(line))).toHaveLength(2);
  });
});
