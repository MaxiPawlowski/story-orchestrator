import type { SharedReadAudit } from "@extraction/index";
import type { JudgeCallRecord } from "@judge/index";
import type { CuratorPassAudit } from "@stagecraft/index";
import { buildModelCalls, judgeRoute, MODEL_CALLS_SHOWN, ROUTE_NOT_RECORDED } from "./modelCalls";
import type { TalkDecisionAudit } from "./types";

const at = (second: number) => `2026-09-26T10:00:${String(second).padStart(2, "0")}.000Z`;

const judge = (overrides: Partial<JudgeCallRecord> = {}): JudgeCallRecord => ({ at: at(1), boundary: 2, messageId: 4, use: "scene", model: "jev-1.13.0", latencyMs: 300, stateChars: 100, questionCount: 2, ...overrides });

const audit = (overrides: Partial<SharedReadAudit> = {}): SharedReadAudit => ({
  id: "a1", createdAt: at(2), priority: 1, reason: "cadence", contractHash: "h", scope: [], window: { from: 0, to: 5 },
  prompt: "", rawResponse: "DELTA x=1", acceptedDeltas: [], rejected: [], ...overrides,
} as SharedReadAudit);

const talk = (overrides: Partial<TalkDecisionAudit> = {}): TalkDecisionAudit => ({ at: at(3), messageId: 6, checkpointId: "cp1", chosenRosterId: "arin", chosenName: "Arin", source: "director", latencyMs: 900, ...overrides });

const pass: CuratorPassAudit = { at: at(4), reason: "boundary", prompt: "", rawResponse: "", proposed: 2, dropped: [] };

describe("v2.5 plan 07 A5: which route answered each call", () => {
  it("names the judge route from the model the call recorded", () => {
    const [row] = buildModelCalls({ judgeCalls: [judge({ inputTokens: 200, outputTokens: 20 })], audits: [], talkDecisions: [], curatorPass: null });
    expect(row).toMatchObject({ kind: "judge", role: "judge:scene", route: "judge:typesafe:jev-1.13.0", result: "ok", ms: 300, tokens: 220, messageId: 4 });
    expect(judgeRoute(null)).toBeNull();
  });

  it("names a judge fallback as the result, and a call that never reached a model has no route", () => {
    const [row] = buildModelCalls({ judgeCalls: [judge({ model: null, fallback: "timeout" })], audits: [], talkDecisions: [], curatorPass: null });
    expect(row).toMatchObject({ route: null, result: "fallback (timeout)" });
  });

  it("LLM passes record no route today: every LLM row reads 'route not recorded', never a configured route", () => {
    const rows = buildModelCalls({ judgeCalls: [], audits: [audit()], talkDecisions: [talk()], curatorPass: pass });
    expect(rows.map((row) => row.kind)).toEqual(["llm", "llm", "llm"]);
    expect(rows.every((row) => row.route === null)).toBe(true);
    expect(ROUTE_NOT_RECORDED).toBe("route not recorded");
  });

  it("describes each LLM pass by what it did", () => {
    const rows = buildModelCalls({ judgeCalls: [], audits: [audit({ acceptedDeltas: [{} as SharedReadAudit["acceptedDeltas"][number]], rejected: [{ line: "x", reason: "y" }] })], talkDecisions: [talk({ source: "fallback", chosenName: null })], curatorPass: pass });
    expect(rows.find((row) => row.role === "read:cadence")).toMatchObject({ result: "1 accepted, 1 rejected", messageId: 5 });
    expect(rows.find((row) => row.role === "director")).toMatchObject({ result: "fallback (silence)", ms: 900, messageId: 6 });
    expect(rows.find((row) => row.role === "curator:boundary")).toMatchObject({ result: "2 proposed", messageId: null });
  });

  it("keeps rule and mention speaker picks out: no model answered them", () => {
    expect(buildModelCalls({ judgeCalls: [], audits: [], talkDecisions: [talk({ source: "rules" }), talk({ source: "mention" })], curatorPass: null })).toEqual([]);
  });

  it("newest first, capped", () => {
    const judgeCalls = Array.from({ length: MODEL_CALLS_SHOWN + 5 }, (_, index) => judge({ at: at(index), messageId: index }));
    const rows = buildModelCalls({ judgeCalls, audits: [], talkDecisions: [], curatorPass: null });
    expect(rows).toHaveLength(MODEL_CALLS_SHOWN);
    expect(rows[0].messageId).toBe(MODEL_CALLS_SHOWN + 4);
  });
});
