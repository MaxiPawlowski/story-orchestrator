jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  sendConnectionProfileRequest: jest.fn(async () => ({ ok: true, text: "", finish: "unknown" })),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAuthoringStage } from "@copilot/index";
import type { StoryV2 } from "@engine/index";
import type { ExtractionReply, ModelAsk, ModelCall } from "@extraction/modelRoute";
import { runRoleCase, type AuthoringCalibrationCase } from "./roleCalibration";

const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/role-calibration/authoring.json"), "utf8"));
const entry = fixture.cases.find((item: { id: string }) => item.id === "a01");
const authoringCase: AuthoringCalibrationCase = { ...entry, draft: fixture.drafts[entry.draft] as StoryV2 };

const scripted = (replies: ExtractionReply[]): ModelCall & { asks: ModelAsk[] } => {
  const asks: ModelAsk[] = [];
  const call = (async (_prompt: string, ask: ModelAsk) => {
    asks.push(ask);
    const next = replies.shift();
    if (!next) throw new Error("no scripted reply");
    return next;
  }) as ModelCall & { asks: ModelAsk[] };
  call.asks = asks;
  return call;
};

const valid = JSON.stringify({ summary: "alarm", ops: [{ kind: "addQuality", quality: { key: "alarm_tripped", type: "bool", source: "extractor", rubric: "Has the alarm been tripped?" } }] });

describe("v2.5 plan 05 F8: the authoring finish reason reaches the calibration record", () => {
  it("a length finish on the first answer and a stop on the repair are both recorded", async () => {
    const model = scripted([{ text: "{\"summary\": \"cut", finish: "length" }, { text: valid, finish: "stop" }]);
    const record = await runRoleCase("authoring", authoringCase, { profileId: null, model, now: () => 0 });
    expect(record.responses).toHaveLength(2);
    expect(record.finishes).toEqual(["length", "stop"]);
  });

  it("the audit carries finish and repairFinish from the real stage run", async () => {
    const model = scripted([{ text: "{\"summary\": \"cut", finish: "length" }, { text: valid, finish: "stop" }]);
    const result = await runAuthoringStage({ draft: authoringCase.draft, stage: "qualities", message: "x", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(result.audit).toMatchObject({ finish: "length", repairFinish: "stop" });
  });

  it("control: an answer that needs no repair records one finish and no repairFinish", async () => {
    const model = scripted([{ text: valid, finish: "stop" }]);
    const result = await runAuthoringStage({ draft: authoringCase.draft, stage: "qualities", message: "x", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(result.audit.finish).toBe("stop");
    expect(result.audit.repairFinish).toBeUndefined();
    const record = await runRoleCase("authoring", authoringCase, { profileId: null, model: scripted([{ text: valid, finish: "stop" }]), now: () => 0 });
    expect(record.finishes).toEqual(["stop"]);
  });

  it("control: refuseIncomplete still blanks an incomplete answer's text, and its finish is still recorded", async () => {
    const model = scripted([{ text: valid, finish: "length" }, { text: valid, finish: "stop" }]);
    const result = await runAuthoringStage({ draft: authoringCase.draft, stage: "qualities", message: "x", history: [] }, model, { role: "authoring", pass: "copilot", refuseIncomplete: true });
    expect(result.audit.rawResponse).toBe("");
    expect(result.audit.finish).toBe("length");
    expect(result.audit.repairFinish).toBe("stop");
    expect(result.status).toBe("ok");
  });
});
