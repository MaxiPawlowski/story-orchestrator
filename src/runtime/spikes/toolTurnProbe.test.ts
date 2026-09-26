import { createToolTurnProbe } from "./toolTurnProbe";
import type { RuntimeManager } from "../runtimeManager";

const mockHost = { chat: [] as unknown[], handlers: new Map<string, (...args: unknown[]) => unknown>() };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: mockHost.chat }),
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHost.handlers.set(entry.eventName, entry.handler);
    return () => mockHost.handlers.clear();
  },
}));

const fakeManager = () => {
  const journal: Array<{ kind: string; boundary: number; messageId: number }> = [];
  const manager = {
    decisions: [] as unknown[],
    onGenerationStarted: jest.fn(),
    onMemberDrafted: jest.fn(),
    recordTalkDecision(audit: unknown) { this.decisions.push(audit); },
    getEngineState: () => ({ boundary: 4 }),
    getTalkState() { return { decisions: this.decisions }; },
    getSessionJournal: () => journal,
  };
  return { manager, journal };
};

describe("SP10 Q1 probe", () => {
  afterEach(() => {
    mockHost.handlers.clear();
    delete globalThis.talkControlInterceptor;
  });

  it("counts the per-generation entry points while started, and puts every original back on stop", async () => {
    const { manager, journal } = fakeManager();
    const originals = { started: manager.onGenerationStarted, drafted: manager.onMemberDrafted };
    const interceptor = jest.fn(async () => undefined);
    globalThis.talkControlInterceptor = interceptor;
    const probe = createToolTurnProbe(manager as unknown as RuntimeManager);
    probe.start();
    mockHost.handlers.get("MESSAGE_SENT")?.(1);
    mockHost.handlers.get("GROUP_MEMBER_DRAFTED")?.(3);
    manager.onMemberDrafted(3);
    mockHost.handlers.get("GENERATION_STARTED")?.("normal", {}, false);
    manager.onGenerationStarted("normal");
    await globalThis.talkControlInterceptor?.([], 0, () => undefined, "normal");
    manager.recordTalkDecision({ id: 1 });
    mockHost.handlers.get("MESSAGE_RECEIVED")?.(2, "normal");
    mockHost.chat = [{}, {}, {}, {}];
    mockHost.handlers.get("TOOL_CALLS_RENDERED")?.([]);
    journal.push({ kind: "boundary", boundary: 4, messageId: 0 }, { kind: "boundary", boundary: 5, messageId: 2 });
    const report = probe.read();
    expect(report.turns).toHaveLength(1);
    expect(report.turns[0].work).toEqual({ generationStarted: 1, memberDrafted: 1, talkDecision: 1, loreSelect: 0, interceptor: 1 });
    expect({ tools: report.turns[0].toolCalls, boundaries: report.turns[0].boundaries, decisions: report.summary.talkDecisions }).toEqual({ tools: 1, boundaries: 1, decisions: 1 });
    expect(originals.started).toHaveBeenCalledWith("normal");
    expect(interceptor).toHaveBeenCalledTimes(1);
    probe.stop();
    expect({ started: manager.onGenerationStarted, drafted: manager.onMemberDrafted, interceptor: globalThis.talkControlInterceptor })
      .toEqual({ started: originals.started, drafted: originals.drafted, interceptor });
    expect(mockHost.handlers.size).toBe(0);
  });
});
