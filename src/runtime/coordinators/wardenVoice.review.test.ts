import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agendaStepKey, parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { VOICE_QUESTION, buildWardenRequests, defaultJudgeSettings, readWarden, wardenRecordP, type JudgeRequest, type JudgeSettings, type WardenInput } from "@judge/index";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";
import { createWarden, voiceProfile, wardenFamilies } from "../continuity";
import { JudgeRuntime } from "../judge";
import { testOwnership } from "../../../test/findings/testOwnership";

const story = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
const state = { activeCheckpointId: "start", blackboard: { values: { rel_arin_player_trust: -2, [agendaStepKey("arin", "debt")]: 0 }, versions: {}, latched: {} } } as unknown as EngineState;
const view = { getStory: () => story, getState: () => state };

const judgeWith = (uses: Partial<JudgeSettings["uses"]>, voiceScore = 0.2) => {
  const base = defaultJudgeSettings();
  const settings: JudgeSettings = { ...base, uses: { ...Object.fromEntries(Object.keys(base.uses).map((key) => [key, false])) as JudgeSettings["uses"], ...uses } };
  const requests: JudgeRequest[] = [];
  const judge = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      return { model: "jev-1.13.0", answers: { voice: { type: "score", score: voiceScore, confidence: 0.9, probabilities: {} } } };
    },
    status: async () => ({ configured: true }),
    record: () => undefined,
    context: () => ({ boundary: 1, messageId: 1 }),
  });
  return { judge, requests };
};

const reply = { speaker: "Arin", text: "Arin beams and tells the stranger everything about her debts, delighted to trust anyone at all." };

describe("v2.7 plan 37 L6: the out-of-character family rides the warden's call, dark", () => {
  it("is an ordinary setting, on by default (owner decision 2026-10-09), and kept off once switched off", () => {
    expect(defaultJudgeSettings().uses.wardenVoice).toBe(true);
    expect(sanitizeGlobalSettings(undefined).judge.uses.wardenVoice).toBe(true);
    const off = defaultGlobalSettings();
    off.judge.uses.wardenVoice = false;
    expect(sanitizeGlobalSettings(off).judge.uses.wardenVoice).toBe(false);
  });

  it("joins the families only while its use is on and the story has character life", () => {
    expect(wardenFamilies(() => judgeWith({}).judge, view)()).toEqual({ agency: false, houseRules: [], lore: false });
    expect(wardenFamilies(() => judgeWith({ wardenVoice: true }).judge, view)()).toMatchObject({ voice: true });
    const plain = { ...view, getStory: () => ({ ...story, life: undefined }) };
    expect(wardenFamilies(() => judgeWith({ wardenVoice: true }).judge, plain)()).not.toHaveProperty("voice");
  });

  it("sends the speaker's role, drive and own feelings, nothing else of the story", () => {
    const profile = voiceProfile(story, state, "Arin");
    expect(profile).toEqual({ speaker: "Arin", role: "a guide with a debt", feelings: expect.arrayContaining(["trust toward {{user}} (the newcomer): -2 on a scale from -3 to 3."]) });
    const [request] = buildWardenRequests({ reply, facts: [], agency: null, houseRules: [], voice: profile ?? undefined });
    expect(Object.keys(request.questions)).toEqual(["voice"]);
    expect((request.questions.voice as { instructions: string }).instructions).toBe(VOICE_QUESTION);
    expect(JSON.stringify(request)).not.toContain("smuggler");
  });

  it("payload invariance: with the family off the request carries no voice", () => {
    const [request] = buildWardenRequests({ reply, facts: ["The bridge fell."], agency: null, houseRules: [] });
    expect(JSON.stringify(request)).not.toContain("voice");
  });

  it("notes, never rewrites, a reply below the threshold, and stays quiet above it", () => {
    const input: WardenInput = { reply, facts: [], agency: null, houseRules: [], voice: { speaker: "Arin", feelings: [] } };
    const low = readWarden({ voice: { type: "score", score: 0.2, confidence: 0.9, probabilities: {} } }, input);
    expect(low).toEqual([{ family: "voice", text: "Voice: the last reply did not sound like Arin. Let the next one come back to their own way of speaking and wanting.", facts: [], score: 0.2 }]);
    expect(low[0].text).not.toMatch(/rewrite|instead say|you /i);
    expect(readWarden({ voice: { type: "score", score: 1.8, confidence: 0.9, probabilities: {} } }, input)).toEqual([]);
    expect(wardenRecordP({ voice: { type: "score", score: 0.2, confidence: 0.9, probabilities: {} } }, input)).toMatchObject({ voice: 0.2 });
  });

  it("one call: the warden asks once and reads the voice finding from that answer", async () => {
    const { judge, requests } = judgeWith({ wardenVoice: true });
    const warden = createWarden(() => judge, view, { facts: () => [], nudgeActive: () => false });
    const findings = await warden.check({ reply, facts: [], agency: null, houseRules: [], voice: warden.voice("Arin") ?? undefined });
    expect(requests).toHaveLength(1);
    expect(findings?.map((finding) => finding.family)).toEqual(["voice"]);
  });
});
