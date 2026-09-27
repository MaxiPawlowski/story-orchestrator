import { buildPairRequest, createJudgeGate, defaultJudgeSettings, JudgeBusyError, type JudgeCallRecord, type JudgeGate, type JudgeRequest, type JudgeResponse } from "@judge/index";
import type { MatchSets, MemoryEntry } from "@memory/index";
import { judgePairRelations } from "./consolidationMatches";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const PLUGIN_MAX_IN_FLIGHT = 2;

const fakePlugin = (maxInFlight = PLUGIN_MAX_IN_FLIGHT) => {
  const seen = { inFlight: 0, peak: 0, refused: 0, answered: 0 };
  const transport = async (_request: JudgeRequest): Promise<JudgeResponse> => {
    if (seen.inFlight >= maxInFlight) {
      seen.refused += 1;
      throw new JudgeBusyError(429);
    }
    seen.inFlight += 1;
    seen.peak = Math.max(seen.peak, seen.inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.answered += 1;
      return { model: "jev-1.13.0", answers: { relation: { type: "choice", choice: "duplicate", confidence: 0.9, probabilities: {} }, same_thing: { type: "noul", noul: 0.9 } } };
    } finally {
      seen.inFlight -= 1;
    }
  };
  return { seen, transport };
};

const runtimeWith = (transport: (request: JudgeRequest) => Promise<JudgeResponse>, gate: JudgeGate, statusLimit: number | null = PLUGIN_MAX_IN_FLIGHT) => {
  const records: JudgeCallRecord[] = [];
  const status = jest.fn(async () => ({ configured: true, maxInFlight: statusLimit }));
  const settings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, memoryPairs: true } };
  const runtime = new JudgeRuntime({
    getSettings: () => settings, transport, status, record: (record) => records.push(record),
    context: () => ({ boundary: 0, messageId: 0 }), ownership: testOwnership(), gate,
  });
  return { runtime, records, status };
};

const group = (): MemoryEntry[] => Array.from({ length: 9 }, (_, index) => ({ id: `m${index}`, text: `note ${index}`, type: "fact", createdAt: index }) as unknown as MemoryEntry);
const eightPairs = (): MatchSets => ({ dup: Array.from({ length: 9 }, (_, index) => new Set(index === 0 ? [] : [0])), sameTopic: Array.from({ length: 9 }, () => new Set<number>()) });

describe("one shared judge gate against the plugin's per-user limit (v2.5 batch 2)", () => {
  it("answers 8 parallel pair calls with no 429 reaching the plugin, no fallback and no status invalidation", async () => {
    const plugin = fakePlugin();
    const { runtime, records, status } = runtimeWith(plugin.transport, createJudgeGate({ retryMs: 1 }));
    const lookup = await judgePairRelations(runtime, group(), eightPairs(), eightPairs());
    expect(Array.from({ length: 8 }, (_, index) => lookup("m0", `m${index + 1}`))).toEqual(Array(8).fill("duplicate"));
    expect(plugin.seen).toMatchObject({ refused: 0, answered: 8, peak: PLUGIN_MAX_IN_FLIGHT });
    expect(records).toHaveLength(8);
    expect(records.filter((record) => record.fallback)).toEqual([]);
    const asked = status.mock.calls.length;
    await runtime.ask("memoryPairs", buildPairRequest("after", "the batch"));
    expect(status).toHaveBeenCalledTimes(asked);
  });

  it("mutant: an unlimited gate fires all 8 at once and the plugin refuses most of them", async () => {
    const plugin = fakePlugin();
    const { runtime } = runtimeWith(plugin.transport, createJudgeGate({ capacity: 8, retryMs: 1 }), null);
    await judgePairRelations(runtime, group(), eightPairs(), eightPairs());
    expect(plugin.seen.refused).toBeGreaterThanOrEqual(6);
  });

  it("takes the plugin's reported limit, so a plugin allowing one call sees one at a time", async () => {
    const plugin = fakePlugin(1);
    const { runtime, records } = runtimeWith(plugin.transport, createJudgeGate({ retryMs: 1 }), 1);
    await judgePairRelations(runtime, group(), eightPairs(), eightPairs());
    expect(plugin.seen).toMatchObject({ refused: 0, answered: 8, peak: 1 });
    expect(records.filter((record) => record.fallback)).toEqual([]);
  });

  it("a 429 is a busy retry: answered on a later attempt, status left alone", async () => {
    let calls = 0;
    const transport = async (): Promise<JudgeResponse> => {
      calls += 1;
      if (calls <= 2) throw new JudgeBusyError(429);
      return { model: "jev-1.13.0", answers: { same_thing: { type: "noul", noul: 0.97 } } };
    };
    const { runtime, records, status } = runtimeWith(transport, createJudgeGate({ retryMs: 1 }));
    const result = await runtime.ask("memoryPairs", buildPairRequest("a", "b"));
    expect(result.answers).not.toBeNull();
    expect(result.fallback).toBeUndefined();
    expect(calls).toBe(3);
    expect(records[0].fallback).toBeUndefined();
    await runtime.ask("memoryPairs", buildPairRequest("a", "c"));
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("a plugin that stays busy ends in a busy fallback that never invalidates status", async () => {
    const transport = async (): Promise<JudgeResponse> => { throw new JudgeBusyError(429); };
    const { runtime, records, status } = runtimeWith(transport, createJudgeGate({ retryMs: 1 }));
    const request = buildPairRequest("a", "b");
    expect((await runtime.ask("memoryPairs", request)).fallback).toBe("busy");
    expect((await runtime.ask("memoryPairs", request)).fallback).toBe("busy");
    expect(records.map((record) => record.fallback)).toEqual(["busy", "busy"]);
    expect(status).toHaveBeenCalledTimes(1);
  });
});
