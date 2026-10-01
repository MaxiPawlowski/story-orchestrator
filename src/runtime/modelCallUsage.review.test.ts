import { replyVia, type ModelTransport } from "@extraction/reply";
import type { ModelReply } from "@services/STAPI";
import { createModelCallVia } from "./modelCallCore";
import type { ModelCallRecord } from "./modelCallLog";
import { buildModelCalls } from "./modelCalls";
import { routeMeters } from "./roleRouteEdits";

const METER = { effort: "default" as const, applied: false, collapsed: false, unsupported: null, budget: 0, chars: 0, tokens: null };

const transport = (reply: Partial<Extract<ModelReply, { ok: true }>>): ModelTransport => async () => ({ ok: true, text: "NO_DELTA", finish: "stop", meter: METER, ...reply });

const ring = async (reply: Partial<Extract<ModelReply, { ok: true }>>) => {
  const records: ModelCallRecord[] = [];
  const call = createModelCallVia(replyVia(transport(reply)), {
    settings: () => ({ profileId: "deepseek" }) as never,
    exists: () => true,
    planted: false,
    record: (record) => records.push(record),
  });
  await call("prompt", { role: "read", pass: "read" });
  return records;
};

describe("AS-20: profile usage and model identity reach the call ring", () => {
  it("a paid profile's usage, cost and model are recorded", async () => {
    const records = await ring({ usage: { input: 120, output: 30, costUsd: 0.0004 }, model: "deepseek-chat" });
    expect(records).toEqual([expect.objectContaining({ route: "deepseek", usage: { input: 120, output: 30, costUsd: 0.0004 }, model: "deepseek-chat" })]);
  });

  it("an answer without usage is recorded as unknown, never as zero", async () => {
    const records = await ring({});
    expect(records[0]).toMatchObject({ usage: { input: null, output: null, costUsd: null }, model: null });
  });

  it("meters count unknown usage apart, and the calls table shows no token count for it", async () => {
    const known = await ring({ usage: { input: 10, output: 5, costUsd: 0.01 }, model: "deepseek-chat" });
    const unknown = await ring({});
    expect(routeMeters([...known, ...unknown])).toEqual([
      { route: "deepseek", calls: 2, ok: 2, failed: 0, fallback: 0, inputTokens: 10, outputTokens: 5, costUsd: 0.01, unknownUsage: 1 },
    ]);
    const rows = buildModelCalls({ judgeCalls: [], audits: [], talkDecisions: [], curatorPass: null, routed: [...known, ...unknown] });
    expect(rows.map((row) => row.tokens).sort()).toEqual([15, null]);
  });
});
