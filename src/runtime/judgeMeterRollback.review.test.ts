import type { RuntimeExtras } from "./types";
import { runRollback, type RollbackDeps } from "./rollback";

jest.mock("@judge/index", () => jest.requireActual("../judge/settings"));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

const { appendJudgeCall, createJudgeRuntime } = jest.requireActual("../judge/settings") as typeof import("../judge/settings");

function harness(judge: RuntimeExtras["judge"]) {
  const extras = { extraction: { audits: [] }, judge, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } } as unknown as RuntimeExtras;
  const deps = {
    engine: {
      shouldRollbackFromMessage: () => false,
      boundaryBeforeMessage: () => 0,
      serialize: () => ({ boundary: 7 }),
      clampToChat: () => false,
      discardPendingFrom: () => [],
    },
    journal: {},
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { deps, extras };
}

describe("the judge meter is exempt from rollback (v2.4 plan 07, inv 11 / X23)", () => {
  it("a rollback cuts the call ring and leaves the meter where it was: a rolled-back call was still paid for", async () => {
    let judge = createJudgeRuntime();
    for (const messageId of [2, 4, 6, 8]) judge = appendJudgeCall(judge, { at: "2026-09-24T00:00:00.000Z", boundary: 1, messageId, use: "warden", model: "jev-1.13.0", latencyMs: 500, stateChars: 100, questionCount: 2, inputTokens: 100, outputTokens: 5 });
    const h = harness(judge);
    await runRollback(h.deps, 5);
    expect(h.extras.judge.calls.map((row) => row.messageId)).toEqual([2, 4]);
    expect(h.extras.judge.meter).toEqual({ calls: 4, cachedCalls: 0, inputTokens: 400, outputTokens: 20, cost: 0 });
  });
});
