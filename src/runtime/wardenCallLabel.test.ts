import { defaultJudgeSettings, judgeCallUse, wardenCallFamilies, type JudgeCallRecord, type JudgeResponse } from "@judge/index";
import { SETTING_COPY } from "@features/settingsCopy";
import { JudgeRuntime } from "./judge";
import { createWardenCheck } from "./continuity";
import { composeInlineTimeline, type InlineSources } from "./inlineTimeline";
import { testOwnership } from "../../test/findings/testOwnership";

const reply = { speaker: "Mara", text: "The gate stays shut." };

describe("v2.8 small fixes 3: a warden call says which checks it carried", () => {
  it("names the families an input asks", () => {
    expect(wardenCallFamilies({ reply, facts: [], agency: { player: "Max", message: "I wait." }, houseRules: ["No magic."] })).toEqual(["agency", "house rules"]);
    expect(wardenCallFamilies({ reply, facts: ["The gate is shut."], agency: null, houseRules: [], lore: [{ comment: "Gate", text: "Iron." }] })).toEqual(["continuity", "lore"]);
  });

  it("labels a ring row by its families", () => {
    expect(judgeCallUse({ use: "warden", families: ["agency", "attention"] })).toBe("warden (agency, attention)");
    expect(judgeCallUse({ use: "warden" })).toBe("warden");
  });

  it("the runtime stamps the families on the record, the warden passes them, and the timeline shows them", async () => {
    const records: JudgeCallRecord[] = [];
    const answered: JudgeResponse = { model: "jev", answers: { agency: { type: "score", score: 0, levels: [] } } as unknown as JudgeResponse["answers"] };
    const runtime = new JudgeRuntime({
      ownership: testOwnership(),
      getSettings: () => defaultJudgeSettings(),
      transport: async () => answered,
      status: async () => ({ configured: true }),
      record: (record) => records.push(record),
      context: () => ({ boundary: 1, messageId: 3 }),
      now: () => 1_000,
    });
    await createWardenCheck(() => runtime)({ reply, facts: [], agency: { player: "Max", message: "I wait." }, houseRules: [] });
    expect(records.map((record) => [record.use, record.families])).toEqual([["warden", ["agency"]]]);
    const view = composeInlineTimeline({
      story: null, settings: { level: 4, window: 20, categories: {} }, authorView: true, chatLength: 12, boundaryLog: [], audits: [], pending: [], reconciliation: [],
      memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: records, proposals: [], curatorPass: null,
      effects: [], tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [], pipeline: { state: "idle", text: "" } as never,
      agencyRecovery: false, lastRollback: null, saveNotice: null,
    } as unknown as InlineSources);
    expect((view.byMessage[3] ?? []).map((item) => item.text)).toContain("judge warden (agency) · 0 ms");
  });

  it("the warden switch's copy says it covers the continuity check and the rest share the call", () => {
    expect(SETTING_COPY["stagecraft.wardenEnabled"].help).toMatch(/covers only that continuity check/);
    expect(SETTING_COPY["stagecraft.wardenEnabled"].help).toMatch(/share the same warden call under their own judge use switches/);
  });
});
