import { readWith } from "../../test/support/modelCall";
import { StoryEngine, parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { PROMISE_ARC_RULE } from "@memory/contract";
import { renderPromiseContractSection } from "@memory/promises/contract";
import { commitmentVerdict } from "./commitGuard";
import { hashContract, renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { readContract, runSharedRead } from "./sharedRead";
import type { OpenPromiseRef } from "@memory/promises/types";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

const story = (): NormalizedStory => parseStoryOrThrow({
  id: "promise-read", title: "Promise read", description: "plan 47",
  qualities: [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }],
  checkpoints: [{ id: "cp1", name: "The Gate", objective: "Get past", type: "anchor", start: true }],
  transitions: [], roster: [{ id: "mara", name: "Mara" }],
});

const window: SharedReadWindow = {
  from: 0, to: 1,
  messages: [
    { index: 0, messageId: 0, speaker: "Mara", text: "Will you find my brother?", isUser: false },
    { index: 1, messageId: 1, speaker: "Rin", text: "I promise I'll find him.", isUser: true },
  ],
};

const OPEN: OpenPromiseRef[] = [{ id: "p12345678", promisee: "Mara", quote: "I swear I'll come back" }];

const read = (reply: string, openPromises: OpenPromiseRef[] | null) => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  return runSharedRead({ story: s, state: engine.serialize(), priority: 0, reason: "p47", window, openPromises, ...readWith("p1", { debugResponse: reply }) });
};

describe("plan 47: the shared read carries promise lines only when the feature is on", () => {
  const contract = (openPromises: OpenPromiseRef[] | null) => {
    const s = story();
    const engine = new StoryEngine();
    engine.loadStory(s);
    const section = openPromises ? { promiseSection: renderPromiseContractSection(openPromises) } : {};
    return { ...readContract({ story: s, state: engine.serialize(), openPromises }, window, []), ...section };
  };

  it("adds the promise section and excludes player promises from arcs", () => {
    const prompt = renderSharedReadPrompt(contract(OPEN));
    expect(prompt).toContain("[promised] <cast name> | m=<message index>");
    expect(prompt).toContain('p12345678 Mara: "I swear I\'ll come back"');
    expect(prompt).toContain(PROMISE_ARC_RULE);
  });

  it("leaves the prompt unchanged when the feature is off", () => {
    const prompt = renderSharedReadPrompt(contract(null));
    expect(prompt).not.toContain("[promised]");
    expect(prompt).not.toContain(PROMISE_ARC_RULE);
    expect(hashContract(contract(null))).not.toBe(hashContract(contract(OPEN)));
  });

  it("keeps promise lines raw for the lazy writer, and never as unrecognized", () => {
    const parsed = parseSharedReadResponse('[promised] Mara | m=1 | "I promise I\'ll find him."\n[kept] p1 | "found"\nNO_DELTA', story());
    expect(parsed.promises).toEqual(['[promised] Mara | m=1 | "I promise I\'ll find him."', '[kept] p1 | "found"']);
    expect(parsed.rejected).toEqual([]);
  });

  it("renders the open promises into the prompt the read sends", async () => {
    expect((await read("NO_DELTA", OPEN)).audit.prompt).toContain('p12345678 Mara: "I swear I\'ll come back"');
    expect((await read("NO_DELTA", null)).audit.prompt).not.toContain("[promised]");
  });

  it("puts the lines on the audit for the boundary writer, and drops them when the feature is off", async () => {
    const reply = '[promised] Mara | m=1 | "I promise I\'ll find him."\nNO_DELTA';
    expect((await read(reply, OPEN)).audit.promiseLines).toHaveLength(1);
    expect((await read(reply, null)).audit.promiseLines).toBeUndefined();
  });
});

describe("plan 47: commitmentVerdict carries the guard's rules without quality relevance", () => {
  const matcher = /\b(?:promise|i'll)\b/i;
  it("commits on a plain promise and reports where", () => {
    expect(commitmentVerdict("Fine. I promise.", matcher)).toEqual({ commits: true, index: 8, matched: "promise" });
  });

  it.each([
    ["I won't promise.", "negated"],
    ["Maybe I'll go.", "hedged"],
    ["Do you promise?", "asked as a question"],
    ["Nothing here.", "no player line names the commitment"],
  ])("holds %s as %s", (line, reason) => {
    expect(commitmentVerdict(line, matcher)).toEqual({ commits: false, reason });
  });

  it("looks only inside the given span", () => {
    expect(commitmentVerdict("I promise. Later I'll see.", matcher, [11, 26])).toMatchObject({ commits: true, matched: "I'll" });
    expect(commitmentVerdict("I promise. Later.", matcher, [11, 17])).toEqual({ commits: false, reason: "no player line names the commitment" });
  });
});
